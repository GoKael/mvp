# Lexa

Lexa 是給台灣使用者的越南語學習 PWA：每課 30 秒、三句中越對照，搭配 Core 300 詞典、主動回憶與本地間隔複習。目前 100 詞已發布，另有 200 詞以「校對中」只讀顯示。

頁首可切換 `台灣人學越南語 / Người Việt học Hoa ngữ`。兩個方向共用概念資料但保存獨立進度；反向模式目前可使用雙語情境課、單字顯示與複習，缺少的繁中單字音檔與中文句型會明確停用，補齊內容前不視為正式發行。

## 本地啟動

```bash
npm install --prefix server
npm start
```

開啟 `http://127.0.0.1:4174/index.html#/today`。
播放使用專案內 MP3；試玩期間必須讓這個本地服務持續執行。若只剩 PWA 快取頁面、服務已關閉，未快取的語音會無法讀取。

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
node scripts/build-reviewed-lessons.js content/transport-30.source.json
node scripts/validate-reviewed-lessons.js content/transport-30.source.json
node scripts/audit-vocabulary.js
node scripts/test-core.mjs
```

正式學習資料位於 `server/data/core.json`、`lessons.json`、`patterns.json` 與 `audio-manifest.json`；`lexicon.json` 是 300 詞查閱索引，只有 `verified` 詞能進入播放、狀態與複習。`core-100.json` 保留為不可變的首發種子。歷史詞表只保留在 `server/data/archive/`，不會進入正式 UI。

`rank` 是穩定的 Lexa 內容目錄位置，不是要求使用者依序背誦的解鎖順序。實際課程依口語頻率、情境必要性與個人弱點選詞。

Core `101–300` 已分成四個 50 詞的 `reviewed` 編輯來源；每詞都有繁中詞義、詞性、三個雙語例句與四個 Gemini MP3。四批共 800 個音檔已通過解碼、時長、`MP3 / 24kHz / mono`、音量、削波、無效樣本、前後留白、靜音占比與錯文重複音檔檢查。人工抽聽前只會進入只讀詞典，不會開放播放、學習狀態或複習。

七個 reviewed 情境候選包位於 `content/basics-30.source.json`、`content/core-context-39.source.json`、`content/transport-30.source.json`、`content/lodging-24.source.json`、`content/shopping-24.source.json`、`content/health-24.source.json`、`content/social-work-30.source.json`。候選包與正式食物課合計連結 Core 300 全部詞彙；執行對應的 `npm run build:*` 會生成課程、雙語音訊工作與 manifest 到 `content/review/`，不會寫入正式 `server/data/lessons.json` 或靜態部署。

建立任一批次的可發布 JSON 與 200 個音檔任務：

```bash
node scripts/build-core-batch.js content/core-151-200.source.json
.venv/bin/python scripts/generate-audio.py \
  --kind all \
  --jobs-file server/data/core-151-200-audio-jobs.json \
  --manifest-file server/data/core-151-200-audio-manifest.json \
  --project YOUR_PROJECT_ID
node scripts/validate-core-batch-audio.js \
  server/data/core-151-200-audio-manifest.json
```

一次檢查四批音檔：

```bash
npm --prefix server run check:core-audio
```

50 個孤立單字全部人工抽聽、例句抽查通過後，才可把該批次從 `reviewed` 升為 `verified` 並合併進正式詞庫。發布時仍會對完整 200 個音檔執行機器音質驗證；任何被標記需重生的例句也會阻止發布。
目前正式學習流程仍只載入 Core 100；完成來源檔或出現在只讀詞典，不等於發音品質已通過。

本地服務啟動後，開啟 `http://127.0.0.1:4174/audio-qa.html?range=101-150`，逐一播放 50 個單字並標記「通過／需重生」，三個例句保留在同卡供抽查。第一次按空白鍵播放；之後按 `1 / 2` 標記時會自動播放下一個未檢查單字。結果只保存在本機，可從頁面匯出供精確重生。

只重生匯出清單中被標記的音檔：

```bash
.venv/bin/python scripts/generate-audio.py \
  --kind all \
  --jobs-file server/data/core-101-150-audio-jobs.json \
  --manifest-file server/data/core-101-150-audio-manifest.json \
  --qa-file ~/Downloads/core-101-150-audio-qa.json \
  --project YOUR_PROJECT_ID
```

50 個單字全部抽聽完成後，必須通過人工結果閘門才可升級：

```bash
node scripts/validate-core-qa.js \
  server/data/core-101-150-audio-manifest.json \
  ~/Downloads/core-101-150-audio-qa.json
```

驗證通過後依序發布 50 詞；命令會再次檢查真人結果與音質，失敗時不會修改正式詞庫：

```bash
npm --prefix server run promote:core -- \
  server/data/core-101-150-audio-manifest.json \
  ~/Downloads/core-101-150-audio-qa.json
```

## 產生 Gemini TTS

先完成 Google ADC 登入並指定已啟用計費與 Text-to-Speech API 的專案：

```bash
.venv/bin/python scripts/generate-audio.py --kind lesson --project YOUR_PROJECT_ID
```

預設使用 Gemini 2.5 Pro TTS、Zephyr、`vi-VN / cmn-TW`，請求間隔 6.5 秒。瀏覽器不會在執行時生成或替代音訊。

產生 reviewed 課程候選音檔（下例為交通包；其他情境替換來源檔與輸出前綴）：

```bash
npm run build:transport
.venv/bin/python scripts/generate-audio.py \
  --kind lesson \
  --jobs-file content/review/transport-audio-jobs.json \
  --manifest-file content/review/transport-audio-manifest.json \
  --project YOUR_PROJECT_ID
node scripts/validate-reviewed-lessons.js content/transport-30.source.json
node scripts/validate-core-batch-audio.js \
  content/review/transport-audio-manifest.json \
  --allow-any-size
```

只重生被人工標記的單字時，可以用文字或檔名篩選：

```bash
.venv/bin/python scripts/generate-audio.py --kind word --match 009-cho --force --project YOUR_PROJECT_ID
```

孤立單字必須人工抽聽；機器驗證只能排除靜音、格式、音量、削波、留白與檔案重複等技術問題，不能判斷聲調、詞義或語氣是否正確。

## Short 預覽

```bash
cd studio/food-shorts
npm run build
npm run check:all
npm run preview
```

10 支 composition 全部由 `server/data/lessons.json` 生成；不要手動修改 `food-*/index.html`。

## 靜態發布

```bash
npm run build
```

部署 Cloudflare Pages 時，Build command 使用 `npm run build`，輸出目錄使用 `dist`。建置發布正式 Core 100、Core 300 只讀詞典、10 課、8 句型與 manifest 內 500 個正式音檔；候選的 800 個音檔、QA 與製作來源不會公開。完整策略見 [`DEPLOYMENT_PLAN.md`](DEPLOYMENT_PLAN.md)。

## Browser Extension

在 Chrome 或 Edge 載入專案根目錄作為 unpacked extension。右鍵選取的文字會進入 Lexa 單字頁收件匣，不會修改正式詞庫。

完整規格見 [`PRODUCT_SPEC_PLAN.md`](PRODUCT_SPEC_PLAN.md)。
