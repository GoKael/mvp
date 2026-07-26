#!/usr/bin/env python3
"""Generate Lexa's published MP3 files with Gemini TTS and Google ADC."""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from google import auth
from google.api_core.exceptions import GoogleAPICallError
from google.cloud import texttospeech

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JOBS_PATH = ROOT / "server/data/audio-jobs.json"
DEFAULT_MANIFEST_PATH = ROOT / "server/data/audio-manifest.json"
MODEL = "gemini-2.5-pro-tts"


def prompt_for(job: dict) -> str:
    if job["languageCode"] == "vi-VN":
        if job["kind"] == "word":
            return (
                "Pronounce exactly the Vietnamese headword once, using the lexical tone and vowel quality "
                "shown by its diacritics. Do not spell, translate, explain, repeat, or add any other sound. "
                "Use a natural standard Vietnamese female voice and keep the result concise."
            )
        return (
            "Speak in natural standard Vietnamese with a warm female voice. "
            "This is a language-learning example: articulate tones clearly, keep a calm conversational pace, "
            "and do not add any words."
        )
    if job["kind"] == "word":
        return (
            "使用自然清楚的台灣華語女性聲音，以精簡、稍快但清楚的字典節奏朗讀詞義一次，"
            "不要解釋、重複或加入原文以外的文字。"
        )
    return (
        "使用自然清楚的台灣華語女性聲音朗讀。語氣溫暖、速度平穩，適合語言學習者跟讀，"
        "不要加入原句以外的文字。"
    )


def refresh_manifest(jobs_path: Path, manifest_path: Path) -> None:
    jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
    payload = {
        "model": MODEL,
        "expected": len(jobs),
        "assets": [
            {**job, "generated": (ROOT / job["output"]).is_file()}
            for job in jobs
        ],
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=["lesson", "word", "example", "pattern", "all"], default="lesson")
    parser.add_argument("--jobs-file", default=str(DEFAULT_JOBS_PATH.relative_to(ROOT)))
    parser.add_argument("--manifest-file", default=str(DEFAULT_MANIFEST_PATH.relative_to(ROOT)))
    parser.add_argument("--qa-file", help="Only regenerate paths listed by an audio QA export")
    parser.add_argument("--match", default="", help="Only generate jobs whose text or output path contains this value")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--delay-ms", type=int, default=6500)
    parser.add_argument("--project", default=os.getenv("GOOGLE_CLOUD_PROJECT"))
    parser.add_argument("--credentials-file", default=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--manifest-every", type=int, default=1)
    args = parser.parse_args()

    jobs_path = ROOT / args.jobs_file
    manifest_path = ROOT / args.manifest_file
    jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
    if args.qa_file:
        qa = json.loads(Path(args.qa_file).expanduser().read_text(encoding="utf-8"))
        regenerate = set(qa.get("regenerate", []))
        jobs = [job for job in jobs if job["output"] in regenerate]
    if args.kind != "all":
        jobs = [job for job in jobs if job["kind"] == args.kind]
    if args.match:
        needle = args.match.casefold()
        jobs = [job for job in jobs if needle in job["text"].casefold() or needle in job["output"].casefold()]
    if not args.force and not args.qa_file:
        jobs = [job for job in jobs if not (ROOT / job["output"]).is_file()]
    if args.limit > 0:
        jobs = jobs[: args.limit]

    print(f"queued {len(jobs)} {args.kind} audio jobs")
    if args.dry_run or not jobs:
        refresh_manifest(jobs_path, manifest_path)
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

    client = texttospeech.TextToSpeechClient(credentials=credentials)
    for index, job in enumerate(jobs, start=1):
        target = ROOT / job["output"]
        target.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(args.retries + 1):
            try:
                response = client.synthesize_speech(
                    input=texttospeech.SynthesisInput(text=job["text"], prompt=prompt_for(job)),
                    voice=texttospeech.VoiceSelectionParams(
                        language_code=job["languageCode"],
                        name=job["voice"],
                        model_name=MODEL,
                    ),
                    audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3),
                )
                break
            except GoogleAPICallError as error:
                if attempt >= args.retries:
                    raise
                retry_delay = 10 * (attempt + 1)
                print(f"temporary TTS error ({error.code}); retrying in {retry_delay}s", flush=True)
                time.sleep(retry_delay)
        target.write_bytes(response.audio_content)
        if index % args.manifest_every == 0 or index == len(jobs):
            refresh_manifest(jobs_path, manifest_path)
        label = target.relative_to(ROOT) if target.is_relative_to(ROOT) else target
        print(f"[{index}/{len(jobs)}] wrote {label}", flush=True)
        if index < len(jobs) and args.delay_ms > 0:
            time.sleep(args.delay_ms / 1000)


if __name__ == "__main__":
    main()
