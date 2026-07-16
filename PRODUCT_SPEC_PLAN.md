# Lexa v2 統一產品規格

本文件是 Lexa 目前唯一有效的產品與技術規格。`SDD.md`、`learning_system_architecture.md`、`product_prd_architecture.md` 僅保留為歷史參考。

## 1. 產品定位

Lexa 首發服務台灣使用者學越南語。核心承諾是：

> 30 秒學三句，100 天敢在越南開口。

MVP 以網站／PWA 為主，只公開人工校驗的 Core 100、10 課越南美食課程與 8 組核心句型。越南人學繁中、Safari Extension、iOS 與 Android 保留在資料模型與後續路線，不阻塞首發。

## 2. 使用流程

固定 Hash 路由：

- `#/today`：今日三句、到期複習、五步學習循環與真實情境路線。
- `#/lessons`：10 個情境課程。
- `#/lesson/:id`：每課三句，中越對照與雙語發音。
- `#/words`：Core 100、搜尋、狀態與瀏覽器選字收件匣。
- `#/review`：主動回憶與 Leitner 複習。
- `#/patterns`：8 組校驗句型。

舊 `memory.html`、`grammar.html`、`content.html` 與 `dashboard/index.html` 只負責跳轉。Gravity Puzzle 留作實驗，不在主導覽。

## 3. 正式資料

對外靜態資料只有：

- `server/data/core.json`（目前已發布詞庫）
- `server/data/core-100.json`（不可變首發種子）
- `server/data/lessons.json`
- `server/data/patterns.json`
- `server/data/audio-manifest.json`

編輯來源位於 `content/food-30.source.json` 與 `content/patterns.source.json`。`content/short_30_script.md` 是從正式 JSON 產生的人工校對稿，不是執行來源。

歷史 `177 / 3000 / 7999` 詞表位於 `server/data/archive/`，不得被產品 UI 當成已完成內容。

Core 300 採分批品質閘門：Core `101–300` 已拆成四個 `content/core-*-*.source.json` 編輯來源，每批 50 詞、每詞三例句，品質維持 `reviewed`。`reviewed` 不是正式資料，不得被 UI 載入；只有例句、四個音檔、50 個孤立單字人工抽聽與完整音檔機器驗證皆通過後才能升為 `verified`。例句保留抽聽入口，任何標記需重生的例句也會阻止發布。批次 `rank` 目前是穩定的內容目錄位置，不等於課程解鎖順序；課程必須優先帶入高頻且當下情境必要的詞，例如 `nhiều / rất / cũng`，不可要求使用者依 1–300 線性背誦。

`rank` 不得宣稱為單一語料庫的原始詞頻名次。實際課程依口語頻率、情境必要性、組合能力與個人弱點選詞。

### 3.1 單字品質

Core 100 每詞必須有唯一 ID、繁中翻譯、詞性、頻率排名、三個自然雙語例句與 `verified` 品質狀態。禁止 `Meaning pending`、`Word` 或英文 UI 佔位值。

### 3.2 課程品質

每課固定 30 秒與三句。每句包含中越句、句內 Core 100 關聯、至少兩個確實出現在原句中的 `focusWords`，以及中文與越南語靜態 MP3 路徑。

### 3.3 句型品質

每組句型必須包含公式、繁中使用說明、易錯提醒與五個自然雙語例句。例句皆提供專案內越南語 MP3；`là`、一般動詞、形容詞以及各自否定句必須明確區分，不得只以中文直譯帶過。

## 4. 學習系統

七大學習法不得做成七個平行頁面或說明卡，必須組成同一條循環：

`選擇情境 → 三句速查 → 拆解句子 → 自己解釋 → 主動回想 → 診斷弱點 → 安排複習`

使用者只看到五個階段：

| 階段 | 結合方法 | 產品行為 |
|---|---|---|
| 今天學什麼 | 學習路線 | Today 選出下一課三句，情境只顯示真實已發布進度。 |
| 先理解 | 智慧摘要＋第一原理 | 先同時快覽三句，再逐句打開角色、動作、核心與時間積木。 |
| 說給自己聽 | 費曼學習 | 使用者先自行解釋，再選擇「我能解釋／還不清楚」並查看簡單答案。 |
| 不看答案想一次 | 主動回憶 | 遮住中文完成一次自評；三句都想起來才能完成課程。 |
| 系統安排下一次 | 弱點評估＋間隔重複 | 錯誤與逾期時間影響排序，Leitner 排程在背景自動執行。 |

每個階段必須有明確觸發、保存狀態與下一步回饋。Today 顯示的是今日完成度，不再重複解釋七種方法。

狀態只有 `new / learning / known / ignored`。`Again` 在 12 小時後重複；`Good` 依 `1 / 3 / 7 / 14 / 30` 天提升盒級；`Mark known` 進第 3 盒；`Reset` 回到 `new`。

所有狀態集中於 Local Storage 的 `lexa:v2`。首次啟動會讀取舊 `vaultWordStatuses`、弱點與排程資料；遷移完成後仍保留舊 key，不做破壞性刪除。

課程句狀態保存 `understoodAt / feynman / feynmanAt / recalledAt / recallMisses`。聽音選句與句子排序答錯必須和翻譯回想一樣增加 `misses`，不可只顯示提示而不影響弱點排序。

## 5. 語音

使用者端只播放專案內 MP3。`lib/audio.mjs` 是唯一播放器，負責停止、排隊、速度、錯誤與播放狀態。缺檔時按鈕停用，發布驗證失敗；禁止 Web Speech、`chrome.tts`、`/api/tts`、macOS `say` 與遠端 runtime fallback。

Gemini TTS 產檔成功不等於發音通過。孤立單字必須人工抽聽；機器驗證器負責攔截解碼、時長、`MP3 / 24kHz / mono`、音量、削波、無效樣本、前後留白、靜音占比與錯文重複音檔問題，已標記的檔案用精確篩選重新生成。句型例句與課程句子優先使用完整語境，降低孤立詞的聲調歧義。

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

### 7.1 雙向學習邊界

目前已提供 `zhTW-vi / vi-zhTW` 方向切換。Today、情境課、單字與複習共用同一份中越資料，依方向交換母語提示與學習目標；每個正式詞條另有唯一 `conceptId`，單字盒、答錯數、課程進度與句子排程以方向分開保存。原本台灣人學越南語的舊進度沿用既有 key，切換後不會被覆蓋。

課程已有雙語音檔，因此可以安全交換播放順序。正式單字與例句目前只有越南語音檔；反向模式會停用缺少的繁中播放鍵，不以越南語音檔或瀏覽器 TTS 冒充。句型頁目前只有已校驗的越南語語法，反向時顯示未發布說明。

正式支援「越南人學繁中」前必須完成：

- 已完成：正式詞條加入語言中立 `conceptId`。
- 已完成：複習與課程進度以方向分開保存；會看懂越南語不等於會主動說出繁中。
- 已完成：課程、單字顯示、句子排序與主動回憶可交換方向，缺少的音檔明確停用。
- 待完成：補齊繁中單字與例句音檔、越南文介面、繁中詞性／拼音資料與中文句型教材。

因此底層架構已可安全一鍵反轉並保存獨立進度；`vi-zhTW` 仍屬內容預覽，不能在繁中音檔、越南文介面與中文句型完成前宣稱正式支援。

### 7.2 外部字典來源

`Ceelog/DictionaryByGPT4` 的 `gptwords.json` 是英文單字對簡體中文的 GPT-4 解析資料，並非越南語字典。它只可參考詞條內容欄位，不得用來覆蓋或驗證 Core 越南語詞義。若引用其內容，必須遵守 CC BY-SA 4.0；Core 300 的越南語校驗仍需使用可追溯的越南語詞典與人工複核。

實際檔案是 8,714 行 JSONL，每行只有英文 `word` 與簡中 `content`。和 Core 300 逐字比對只碰到 `to / ba / taxi` 三筆，其中前兩筆是跨語言同形異義，不能建立可靠中越對應；因此產品不匯入這份 17 MB 資料，也不把它列為 Core 300 的校驗證據。

下一輪詞義校驗預設以越南語 Wiktionary 的公開 dump 核對詞性與主要義項，再由人工改寫成台灣繁中；Wiktionary 內容同樣需要保留 CC BY-SA 4.0 來源紀錄，不能無標示複製到正式詞庫。

## 8. 驗收門檻

- 資料：100 個唯一校驗詞、10 課 × 3 句、8 句型、無佔位值。
- 音訊：500 個 manifest 項目；發布範圍檔案可解碼，句子不超過 9.5 秒，單字長度介於 0.18–2.5 秒。
- 狀態：遷移、Known／Reset、重新整理保存與到期排序通過。
- 路由：所有 Hash 路由可直開、返回、重新整理，舊 URL 正確跳轉。
- 流程：三句速查、拆解、自述、回想、完成課程、雙語播放、加入單字與評分複習可重現；重新整理後步驟進度保留。
- PWA：Chrome、Edge、Safari 桌機與行動尺寸完成導航、播放、儲存與離線 smoke test。
- HyperFrames：`lint`、`validate`、`inspect` 通過，抽查 `0 / .2 / 9.9 / 10 / 20 / 29.9` 秒。
- 安全：沒有 API key、個人絕對路徑、runtime TTS URL 或未追蹤 secrets。

## 9. 後續路線

1. 每批 50 詞完成繁中詞義、詞性、三例句、四音檔與人工抽聽，逐批從 Core 100 發布到 Core 300。
2. 新增交通、住宿、購物、健康求助、社交工作等 30 秒課程包，讓每個新詞至少進入一個課程或句型。
3. 長期詞彙階梯採 `300 旅行生存 → 1,000 例行生活 → 2,000 熟悉情境獨立溝通 → 3,000 日常核心 → 5,000+ 廣泛輸入`。這是產品目標，不是 CEFR 官方字數。
4. 先驗證 Chrome／Edge 擷取流程，再評估 Safari Extension。
5. PWA 留存與學習成效成立後，再評估 iOS／Android 包裝。

## 10. 部署

全球首發採 Cloudflare Pages 純靜態部署，網站與 MP3 同源，播放過的音檔才由 Service Worker 快取；第一版不使用 R2、Functions、帳號或資料庫。完整容量、成本與升級條件見 `DEPLOYMENT_PLAN.md`。
