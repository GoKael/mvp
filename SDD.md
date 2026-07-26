# Lexa — Vietnamese Trilingual Mastery: Software Design Document (SDD)

> **歷史參考（已停用）**：本文件描述 v1 多頁原型，與現行資料、路由、語音及狀態規格不一致。實作一律以 `PRODUCT_SPEC_PLAN.md` 為準。

## 1. 原則與目標 (Principles & Goals)
Lexa 是一個專為越南語學習者設計的高效率字彙掌握平台。本系統的核心在於「以高頻單字為中心 (Core-Vocabulary First)」，透過實務校驗的例句、沉浸式的發音回饋與科學化的複習機制，幫助使用者在最短時間內從 N5 晉算至 MASTER 等級。

---

## 2. 核心系統功能 (Core Features)

### 2.1 單字狀態管理 (Unified Status Management)
透過 `Known` / `Learning` / `Ignore` 三種狀態，定義使用者對單字的熟悉度：
- **Known (綠色)**: 已完全掌握。在介面中顯示為綠色背景與邊框。
- **Learning (黃色)**: 正在學習中。在介面中顯示為黃色背景與邊框，且此類單字會優先出現在 Practice 測驗池中。
- **Ignore (灰色)**: 忽略（過於簡單或不感興趣）。在介面中顯示為灰色，降低干擾。
- **功能規格**:
    - 單字狀態即時同步於 `chrome.storage.local`，確保 Vault 與 Practice 模組無縫切換。
    - 點擊狀態按鈕後，UI 應立即反映顏色變化，並自動計算當日學習進度。

### 2.2 實務校驗數據庫 (Validated Data Pipeline)
單字數據不僅是翻譯，更包含情境：
- **3 個實務例句**: 每個單字必須包含 3 個經過校驗的越南語例句，確保用法道地而非 AI 亂數生成。
- **單字詳細元數據**:
    - 漢越音 (Hán-Việt) 解析。
    - 詞性標註 (Type)。
    - 全域排名 (Rank) 以區分頻率等級。
- **功能規格**: 數據存儲於 `server/data/lr_1k.json` (首批校驗 1,000 字)，架構需支持動態擴展至 10,000 字而不影響讀取流暢度。

### 2.3 交互式語音觸發 (Interactive Audio)
所有互動行為皆應提供聽覺回饋：
- **全文發音**: 點擊單字標題、個別例句、或例句中的特定 Token，皆會觸發越南語真人合成發音。
- **功能規格**: 優先使用 `chrome.tts` 越南語引擎；若環境不支援，則自動降級 (Fallback) 至 Web Speech API，確保發揮跨平台一致性。

---

## 3. Word Library (Vault) 模組規格

### 3.1 視覺化詞庫概覽 (Visual Heatmap & Analytics)
- **單字熱力圖**: 仿照 GitHub 的貢獻圖，顯示使用者過去一年內學習單字的頻率與進度。
- **實時計數器**: 顯示當前 Known / Learning / Total 的數量分布。

### 3.2 智能單字索引 (Smart Indexing)
- **範圍篩選**: 提供 500, 1000, MASTER (10k) 等不同的詞庫範圍層級切換。
- **模糊搜尋**: 支援越南語、漢越音、與中文定義的快速模糊檢索。
- **單字卡片**: 點擊列表中單字後，右側滑入 (Right Sidebar) 字典面板。

### 3.3 字典側邊欄 (Contextual Dictionary Sidebar)
- **動態適配**: 字典欄應根據單字長度與螢幕寬度自動伸縮，不遮擋單字列表內容。
- **功能標籤 (Tabs)**:
    - `EXAMPLES`: 顯示該單字的 3 個核心校驗例句。
    - `AI NOTE`: 單字的漢越音解析與細微含義差異。
    - `GRAMMAR`: 該單字常見的句型結構。

---

## 4. Practice (Memory) 模組規格

### 4.1 科學化測驗配置 (Session Configuration)
- **測驗卡片 (Quiz Card)**: 為測驗區域增加微弱底色與圓角。點擊卡片任何位置觸發全句語音播放。
- **翻譯顯示 (Translations)**: 在練習句下方同步顯示英文與中文翻譯。
- **佈局修復 (Sidebar Layout)**: 修正字典側邊欄遮擋例句的問題，確保側邊欄開啟時主內容區域自動平移。

### 4.2 測驗交互介面 (Quiz UI)
- **Bento 中央布局**: 採用現代簡約風格，將例句與選項置於視覺中心位置。
- **沉浸式發音**: 每一題載入時，自動朗讀例句，強化聽辨能力。
- **多態標記**: 提供大型 `KNOWN` (綠), `LEARN` (黃), `IGNORE` (灰) 行動按鈕。

### 4.3 效率快捷鍵 (Productivity Hotkeys)
- **Z Key**: 標記為 Known 並自動跳轉下一題。
- **X Key**: 標記為 Learn 並自動跳轉下一題。
- **C Key**: 標記為 Ignore 並自動跳轉下一題。
- **功能規格**: 當側邊欄展開時，快捷鍵行為應與側邊欄按鈕同步，確保操作邏輯一致。

---

## 5. 技術架構與擴展 (Technical Architecture)

### 5.1 數據結構 (Data Schema)
```json
{
  "word": "tuyệt vời",
  "trans": "絕佳的",
  "hv": "tuyệt vĩ",
  "rank": 420,
  "type": "adj",
  "examples": [
    { "vi": "Món ăn này thật tuyệt vời.", "zh": "這道菜真棒。" },
    ...x3
  ]
}
```

### 5.2 狀態存儲 (State Store)
系統採用 **Chrome Local Storage** 作為主要狀態來源。
- `vaultWordStatuses`: 存儲 `{ "word": status_code }` 映射。
- `dailyLearnedWords`: 存儲每日學習單字的流水帳，用於生成熱力圖。

### 5.3 彈性擴展 (Scalability Path)
- **後端同步**: 未來將引入 `receiver.py` 與 `gen_json.py` 的全自動化校驗管線，支持從網絡抓取 10,000+ 個單字並自動校對例句準確性。
- **三語切換**: 系統預留了中文、越南語、英語三語對照的緩衝空間。

---

### 6. 未來里程碑 (Next Milestones)
1. [x] **數據擴容**: 完成 1,000 個單字與 3,000 個高品質地道例句的導入。
2. [ ] **深度學習建議**: 基於使用者的錯誤行為，自動生成單字的 AI 解剖筆記。
3. [ ] **組件化重構**: 將 UI 交互進一步封裝為 Headless 組件，提升效能。

---

## 7. 開發教訓與風險管理 (Lessons Learned)

### 7.1 安全性 (Security & CSP)
- **Manifest V3 規範**: 嚴格禁止在 HTML 中使用內聯 `onclick` 或 `<script>`。所有事件監聽器必須在獨立的 `.js` 檔案中透過 `addEventListener` 或 `element.onclick` 綁定。
- **解決方案**: 引入 `safeClick(id, fn)` 工具函數，確保腳本在執行時先驗證 DOM 元素是否存在，避免因單個按鈕缺失導致整個模組崩潰。

### 7.2 穩定性 (Stability & Null Safety)
- **DOM 依賴**: 共享的 `vault.js` 或 `memory.js` 在不同頁面執行時，可能會因為缺少特定的 UI 容器（如 `hover-popover`）而報錯。
- **解決方案**: 在 HTML 中預留必要的隱藏容器，或在 JS 中加入全面性的 `if (element)` 檢查。

### 7.3 數據對接 (Data Mapping & Normalization)
- **Unicode 衝突**: 越南語的聲調在搜尋時可能因規範化 (Normalization) 導致 Key 不匹配。
- **解決方案**: 在數據加載階段統一對所有 Key 進行 `normalizeKey()` 處理，確保查詢邏輯具有強健的容錯性。

---

## 8. Grammar (語法) 模組規格

### 8.1 視覺設計 (Refined Editorial)
- 遵循 `frontend-design` 規範，採用「精緻社論風 (Refined Editorial)」。
- 粗體 Display 字體標題，大量負空間，以及 Bento-style 的語法卡片。

### 8.2 功能邏輯
- **語法列表**: 初始載入 8 組核心語法（總計畫 80 組）。
- **交互細節**: 點擊語法卡片展開詳情，包含 5 個地道例句、中文翻譯、英文翻譯與獨立語音按鈕。
- **數據來源**: `server/data/grammar.json`。

### 8.3 初始載入語法 (Batch 01)
1. Động từ (動詞) 〈動詞的應用〉
2. không ＋ 動詞 (不～、沒～)
3. Tính từ (形容詞) 〈形容詞的應用〉
4. không ＋ 形容詞 (不～)
5. có ＋ 動詞／形容詞 ＋ không? (有～嗎？)
6. là (是)
7. không phải là~ (不是～)
8. Có phải là ＋ 名詞 ＋ không? (是～嗎？)
