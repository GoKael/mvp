# Lexa 零成本部署與音檔策略

> 決策日期：2026-07-16。目標是先讓全球使用者打開網站即可學習，不先建立帳號、資料庫或付費後端。

## 1. 決策

首發使用 **Cloudflare Pages**，網站、JSON、圖示與 MP3 同源發布。可先使用免費 `pages.dev` 網址；需要品牌網址時才購買網域。

GitHub Pages 保留為免費備援與內部驗收，不作正式商業站。其 workflow 必須執行同一個 `npm run build` 並且只上傳 `dist`，不可直接公開整個 repository。

不先使用 R2：工作區雖有 1,702 個 MP3，但正式 Core 100 與 10 課只發布 manifest 內的 500 個，現在整個 `dist` 為 520 檔、約 4.2 MiB。只有音檔庫需要獨立版本、單檔超過 25 MiB、總檔案逼近 20,000，或需要與網站分開發布時才搬到 R2。

## 2. 使用者端音檔

- 首次開啟只下載網站殼、今日課程必要資料與少量課程音檔。
- 其他 MP3 點擊播放時由 Cloudflare 全球節點串流。
- Service Worker 將成功播放過的檔案保存在瀏覽器快取，之後可離線重播。
- 不強迫每位使用者下載整個音檔庫；未來若有人需要完整離線學習，再加一個明確的「下載離線包」動作。
- 學習狀態先留在 `localStorage`，所以跨裝置不會同步。需要帳號同步時才增加後端。

## 3. 現況與免費額度

| 項目 | Lexa 現況 | 免費平台邊界 | 結論 |
|---|---:|---:|---|
| 正式 MP3 | 500 檔；完整 `dist` 520 檔、約 4.2 MiB | Cloudflare 每版最多 20,000 靜態檔 | 足夠 |
| 候選 MP3 | 工作區另有 1,202 檔，人工 QA 前不發布 | 不占正式站容量 | 保持隔離 |
| 單檔 | 遠低於 1 MiB | 單一靜態檔最多 25 MiB | 足夠 |
| 流量 | 純靜態 | Cloudflare 靜態資產請求免費且不限量 | 適合全球首發 |
| 建置 | 原生 HTML/CSS/JS | Cloudflare Pages Free 每月 500 次建置 | 足夠 |
| 動態後端 | 無 | 不使用 Functions 就不消耗 Worker 動態請求 | 維持零成本 |

## 4. 發布結構

部署時只輸出產品需要的檔案，不把來源稿、TTS 腳本、QA、影片工作區或封存詞表公開：

```text
dist/
  index.html
  app.js
  styles.css
  sw.js
  manifest.webmanifest
  lib/
  assets/icon.svg
  assets/audio/
  server/data/core.json
  server/data/core-100.json
  server/data/lexicon.json
  server/data/lessons.json
  server/data/patterns.json
  server/data/audio-manifest.json
```

Hash 路由不需要伺服器 rewrite。Express 只供本地開發；正式站直接由靜態平台提供檔案。

## 5. Cloudflare Pages 設定

1. 連接 GitHub repository 與要發布的 branch。
2. Build command 填 `npm run build`。
3. Build output directory 填 `dist`。
4. 不設定 Functions、環境變數或 API key。

`npm run build` 會先重建並嚴格驗證正式資料與音檔，再以白名單建立 `dist`。候選詞表、TTS 工具、QA 結果與個人憑證不會被複製。`_headers` 已為入口與 Service Worker 設定重新驗證，並讓 MP3 在 CDN 快取 30 天。

GitHub Pages 備援使用 `.github/workflows/pages.yml`，同樣只部署 `dist`。Hash 路由與相對資源路徑可直接在 repository 子路徑運作，不需要 rewrite。

## 6. 升級條件

只有發生以下任一情況才增加基礎設施：

1. 音檔超過 Cloudflare 靜態資產檔案數／單檔限制：移到 R2。
2. 需要跨裝置同步、登入或付費：加入最小 API 與資料庫。
3. R2 每月讀取超過免費 1,000 萬次：再評估合併音檔、長快取或付費成本。
4. 需要 App Store 離線包：沿用相同 JSON／MP3，打包進 iOS／Android 應用。

## 7. 官方依據

- [Cloudflare 靜態資產計費](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)：靜態資產請求免費且不限量，儲存靜態資產沒有額外費用。
- [Cloudflare Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)：Free 每站 20,000 檔、單檔 25 MiB、每月 500 次建置。
- [Cloudflare R2 計費](https://developers.cloudflare.com/r2/pricing/)：Standard 免費 10 GB-month、每月 1M Class A、10M Class B，直接對外傳輸免 egress 費。
- [GitHub Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)：網站 1 GB、每月 100 GB 軟性流量限制，且不應作為商業 SaaS 主機。
