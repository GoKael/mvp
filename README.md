# Lexa

Lexa 是給台灣使用者的越南語學習 PWA：每課 30 秒、三句中越對照，搭配 Core 100、主動回憶與本地間隔複習。

## 本地啟動

```bash
cd server
npm install
npm start
```

開啟 `http://127.0.0.1:4174/index.html#/today`。

## 主要路由

- `#/today`
- `#/lessons`
- `#/lesson/food-001`
- `#/words`
- `#/review`
- `#/patterns`

## 資料與測試

```bash
node scripts/build-data.js
node scripts/validate-data.js --strict-audio
node scripts/test-core.mjs
```

正式資料位於 `server/data/core-100.json`、`lessons.json`、`patterns.json` 與 `audio-manifest.json`。歷史詞表只保留在 `server/data/archive/`，不會進入正式 UI。

## 產生 Gemini TTS

先完成 Google ADC 登入並指定已啟用計費與 Text-to-Speech API 的專案：

```bash
.venv/bin/python scripts/generate-audio.py --kind lesson --project YOUR_PROJECT_ID
```

預設使用 Gemini 2.5 Pro TTS、Zephyr、`vi-VN / cmn-TW`，請求間隔 6.5 秒。瀏覽器不會在執行時生成或替代音訊。

只重生被人工標記的單字時，可以用文字或檔名篩選：

```bash
.venv/bin/python scripts/generate-audio.py --kind word --match 009-cho --force --project YOUR_PROJECT_ID
```

孤立單字必須人工抽聽；驗證器會攔截短於 0.18 秒或長於 2.5 秒的可疑檔案。

## Short 預覽

```bash
cd studio/food-shorts
npm run build
npm run check:all
npm run preview
```

10 支 composition 全部由 `server/data/lessons.json` 生成；不要手動修改 `food-*/index.html`。

## Browser Extension

在 Chrome 或 Edge 載入專案根目錄作為 unpacked extension。右鍵選取的文字會進入 Lexa 單字頁收件匣，不會修改正式詞庫。

完整規格見 [`PRODUCT_SPEC_PLAN.md`](PRODUCT_SPEC_PLAN.md)。
