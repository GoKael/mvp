#!/usr/bin/env python3
"""Generate Mandarin Core audio in validated bundles to reduce TTS requests."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

from google import auth
from google.api_core.exceptions import GoogleAPICallError
from google.cloud import texttospeech

ROOT = Path(__file__).resolve().parent.parent
MODEL = "gemini-2.5-pro-tts"
PROMPT = (
    "使用自然清楚的台灣華語女性聲音朗讀。語氣溫暖、速度平穩，適合語言學習者跟讀。"
    "嚴格保留文字中的長停頓，不要加入、刪除或重複任何內容。"
)


def duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout)


def internal_silences(path: Path) -> list[tuple[float, float]]:
    total = duration(path)
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "silencedetect=noise=-42dB:d=0.55", "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    starts: list[float] = []
    silences: list[tuple[float, float]] = []
    for line in result.stderr.splitlines():
        start = re.search(r"silence_start:\s*([\d.]+)", line)
        if start:
            starts.append(float(start.group(1)))
        end = re.search(r"silence_end:\s*([\d.]+)", line)
        if end and starts:
            pair = (starts.pop(0), float(end.group(1)))
            if pair[0] > 0.1 and pair[1] < total - 0.2:
                silences.append(pair)
    return silences


def split_bundle(bundle: Path, jobs: list[dict]) -> bool:
    silences = internal_silences(bundle)
    expected = len(jobs) - 1
    if len(silences) < expected:
        return False
    silences = sorted(sorted(silences, key=lambda pair: pair[1] - pair[0], reverse=True)[:expected])
    total = duration(bundle)
    for index, job in enumerate(jobs):
        start = 0 if index == 0 else max(0, silences[index - 1][1] - 0.1)
        end = total if index == len(jobs) - 1 else min(total, silences[index][0] + 0.1)
        target = ROOT / job["output"]
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False, dir=target.parent) as handle:
            temporary = Path(handle.name)
        try:
            subprocess.run(
                [
                    "ffmpeg", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-i", str(bundle),
                    "-t", f"{end - start:.3f}", "-ar", "24000", "-ac", "1",
                    "-af", (
                        "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-42dB,"
                        "areverse,silenceremove=start_periods=1:start_duration=0.2:start_threshold=-42dB,areverse"
                    ),
                    "-codec:a", "libmp3lame", "-b:a", "64k", str(temporary),
                ],
                check=True,
            )
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return True


def refresh_manifest(jobs_path: Path, manifest_path: Path) -> None:
    jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
    manifest_path.write_text(
        json.dumps(
            {
                "model": MODEL,
                "expected": len(jobs),
                "assets": [{**job, "generated": (ROOT / job["output"]).is_file()} for job in jobs],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs-file", default="server/data/audio-jobs.json")
    parser.add_argument("--manifest-file", default="server/data/audio-manifest.json")
    parser.add_argument("--project", default=os.getenv("GOOGLE_CLOUD_PROJECT"))
    parser.add_argument("--credentials-file", default=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    parser.add_argument("--delay-ms", type=int, default=6500)
    parser.add_argument("--max-items", type=int, default=8)
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    jobs_path = ROOT / args.jobs_file
    manifest_path = ROOT / args.manifest_file
    jobs = [
        job
        for job in json.loads(jobs_path.read_text(encoding="utf-8"))
        if job["languageCode"] == "cmn-TW" and not (ROOT / job["output"]).is_file()
    ]
    groups_by_rank: dict[str, list[dict]] = {}
    for job in jobs:
        rank = re.search(r"/(\d{3,4})-", job["output"])
        if not rank:
            raise ValueError(f"Cannot identify Core rank from {job['output']}")
        groups_by_rank.setdefault(rank.group(1), []).append(job)
    groups = list(groups_by_rank.values())
    if any(len(group) > args.max_items for group in groups):
        raise ValueError(f"A Core group exceeds --max-items {args.max_items}")
    print(f"queued {len(jobs)} Mandarin files in {len(groups)} bundles", flush=True)
    if args.dry_run or not jobs:
        return

    if args.credentials_file:
        credentials, detected_project = auth.load_credentials_from_file(
            args.credentials_file,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
            quota_project_id=args.project,
        )
    else:
        credentials, detected_project = auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
            quota_project_id=args.project,
        )
    project = args.project or detected_project
    if not project:
        raise SystemExit("A billed Google Cloud project is required. Pass --project or set GOOGLE_CLOUD_PROJECT.")
    client = texttospeech.TextToSpeechClient(credentials=credentials, transport="rest")
    last_request = 0.0
    completed = 0

    def synthesize(items: list[dict]) -> bytes:
        nonlocal last_request
        wait = args.delay_ms / 1000 - (time.monotonic() - last_request)
        if wait > 0:
            time.sleep(wait)
        for attempt in range(args.retries + 1):
            try:
                last_request = time.monotonic()
                response = client.synthesize_speech(
                    input=texttospeech.SynthesisInput(
                        text=" [long pause] ".join(item["text"] for item in items),
                        prompt=PROMPT,
                    ),
                    voice=texttospeech.VoiceSelectionParams(
                        language_code="cmn-TW",
                        name="Zephyr",
                        model_name=MODEL,
                    ),
                    audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3),
                )
                return response.audio_content
            except GoogleAPICallError:
                if attempt >= args.retries:
                    raise
                time.sleep(10 * (attempt + 1))
        raise RuntimeError("TTS request failed")

    def generate(items: list[dict]) -> None:
        nonlocal completed
        if len(items) == 1:
            target = ROOT / items[0]["output"]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(synthesize(items))
            completed += 1
            return
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as handle:
            bundle = Path(handle.name)
        try:
            bundle.write_bytes(synthesize(items))
            if split_bundle(bundle, items):
                completed += len(items)
                return
        finally:
            bundle.unlink(missing_ok=True)
        middle = len(items) // 2
        generate(items[:middle])
        generate(items[middle:])

    for index, group in enumerate(groups, start=1):
        generate(group)
        if completed % 100 < len(group) or index == len(groups):
            refresh_manifest(jobs_path, manifest_path)
        print(f"[{completed}/{len(jobs)}] generated", flush=True)


if __name__ == "__main__":
    main()
