# Lexa v2 統一產品規格

本文件是 Lexa 目前唯一有效的產品與技術規格。`SDD.md`、`learning_system_architecture.md`、`product_prd_architecture.md` 僅保留為歷史參考。

## 1. 產品定位

Lexa 首發服務台灣使用者學越南語。核心承諾是：

> 30 秒學三句，100 天敢在越南開口。

MVP 以網站／PWA 為主，只公開人工校驗的 Core 100、10 課越南美食課程與 8 組核心句型。越南人學繁中、Safari Extension、iOS 與 Android 保留在資料模型與後續路線，不阻塞首發。

## 2. 使用流程

固定 Hash 路由：

- `#/today`：今日三句、待複習數與繼續學習。
- `#/lessons`：10 個情境課程。
- `#/lesson/:id`：每課三句，中越對照與雙語發音。
- `#/words`：Core 100、搜尋、狀態與瀏覽器選字收件匣。
- `#/review`：主動回憶與 Leitner 複習。
- `#/patterns`：8 組校驗句型。

舊 `memory.html`、`grammar.html`、`content.html` 與 `dashboard/index.html` 只負責跳轉。Gravity Puzzle 留作實驗，不在主導覽。

## 3. 正式資料

對外靜態資料只有：

- `server/data/core-100.json`
- `server/data/lessons.json`
- `server/data/patterns.json`
- `server/data/audio-manifest.json`

編輯來源位於 `content/food-30.source.json` 與 `content/patterns.source.json`。`content/short_30_script.md` 是從正式 JSON 產生的人工校對稿，不是執行來源。

歷史 `177 / 3000 / 7999` 詞表位於 `server/data/archive/`，不得被產品 UI 當成已完成內容。

### 3.1 單字品質

Core 100 每詞必須有唯一 ID、繁中翻譯、詞性、頻率排名、三個自然雙語例句與 `verified` 品質狀態。禁止 `Meaning pending`、`Word` 或英文 UI 佔位值。

### 3.2 課程品質

每課固定 30 秒與三句。每句包含中越句、句內 Core 100 關聯、至少兩個確實出現在原句中的 `focusWords`，以及中文與越南語靜態 MP3 路徑。

### 3.3 句型品質

每組句型必須包含公式、繁中使用說明、易錯提醒與五個自然雙語例句。例句皆提供專案內越南語 MP3；`là`、一般動詞、形容詞以及各自否定句必須明確區分，不得只以中文直譯帶過。

## 4. 學習系統

| 方法 | 產品行為 |
|---|---|
| 第一原理 | 把句子拆成可替換的核心詞組。 |
| 智慧摘要 | 每課固定三句與詞組速查。 |
| 學習路線 | 依飲食、交通、住宿與求助顯示情境進度。 |
| 費曼學習 | 顯示答案前先要求使用者自行解釋。 |
| 主動回憶 | 遮住翻譯後再翻面評分。 |
| 弱點評估 | 依錯誤次數與逾期時間提高排序。 |
| 間隔重複 | 本地 Leitner 盒產生到期清單。 |

狀態只有 `new / learning / known / ignored`。`Again` 在 12 小時後重複；`Good` 依 `1 / 3 / 7 / 14 / 30` 天提升盒級；`Mark known` 進第 3 盒；`Reset` 回到 `new`。

所有狀態集中於 Local Storage 的 `lexa:v2`。首次啟動會讀取舊 `vaultWordStatuses`、弱點與排程資料；遷移完成後仍保留舊 key，不做破壞性刪除。

## 5. 語音

使用者端只播放專案內 MP3。`lib/audio.mjs` 是唯一播放器，負責停止、排隊、速度、錯誤與播放狀態。缺檔時按鈕停用，發布驗證失敗；禁止 Web Speech、`chrome.tts`、`/api/tts`、macOS `say` 與遠端 runtime fallback。

Gemini TTS 產檔成功不等於發音通過。孤立單字必須人工抽聽；驗證器會攔截短於 0.18 秒或長於 2.5 秒的可疑單字音檔，已標記的檔案用精確篩選重新生成。句型例句與課程句子優先使用完整語境，降低孤立詞的聲調歧義。

製作端使用 Gemini 2.5 Pro TTS 與 Zephyr：

- 越南語：`vi-VN`
- 台灣華語：`cmn-TW`
- 每次請求間隔：`6500ms`
- 每個 Short：3 句 × 2 語言，共 6 個 MP3

認證只來自 Google ADC 或環境變數。API key、憑證與個人絕對路徑不得進入 HTML、JSON、Git 或瀏覽器儲存。

## 6. Short

`scripts/build-shorts.js` 從 `lessons.json` 生成 `studio/food-shorts/food-001` 至 `food-010`。每支為 `1080 × 1920`、30 秒、三個固定 10 秒場景。

- 主題、中文、越文與詞組同拍出現。
- 文字在音訊前至少 200ms 可見。
- 中越核心詞使用琥珀黃色高光。
- 音訊必須是 composition 根節點直接子元素。
- CSS 管靜態排版，GSAP 只管動畫；同一元素不可由兩者同時寫 transform。
- 時間軸必須 paused、seek-safe、無隨機值與無限動畫。
- 預覽驗收前不輸出 MP4。

## 7. Extension 與平台

Chrome／Edge 共用 Manifest V3 薄入口：工具列開啟 Lexa，右鍵將選取文字加入 `lexaCapturedPhrases`。Extension 不注入字幕監聽、不呼叫 localhost、不修改正式 JSON。

網站使用原生 HTML、CSS、ES modules、Local Storage 與 Express，不加入 React、路由框架、狀態框架或資料庫。

## 8. 驗收門檻

- 資料：100 個唯一校驗詞、10 課 × 3 句、8 句型、無佔位值。
- 音訊：500 個 manifest 項目；發布範圍檔案可解碼，句子不超過 9.5 秒，單字長度介於 0.18–2.5 秒。
- 狀態：遷移、Known／Reset、重新整理保存與到期排序通過。
- 路由：所有 Hash 路由可直開、返回、重新整理，舊 URL 正確跳轉。
- 流程：完成課程、雙語播放、加入單字、評分複習可重現。
- PWA：Chrome、Edge、Safari 桌機與行動尺寸完成導航、播放、儲存與離線 smoke test。
- HyperFrames：`lint`、`validate`、`inspect` 通過，抽查 `0 / .2 / 9.9 / 10 / 20 / 29.9` 秒。
- 安全：沒有 API key、個人絕對路徑、runtime TTS URL 或未追蹤 secrets。

## 9. 後續路線

1. 校驗並發布 177 詞候選集。
2. 新增交通、住宿、求助等 30 秒課程包。
3. 先驗證 Chrome／Edge 擷取流程，再評估 Safari Extension。
4. PWA 留存與學習成效成立後，再評估 iOS／Android 包裝。
