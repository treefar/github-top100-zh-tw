# GitHub 前百大中文精選：最新交接

更新時間：2026-08-08 21:59（Asia/Taipei）

## 目前狀態

- 已在既有純靜態網站上完成「下載、繁中重點、個人推薦」強化，保留原有 100 筆資料、自動更新、搜尋、分類、排序、收藏、CSV 與離線快取。
- Repository 已公開：`https://github.com/treefar/github-top100-zh-tw`
- GitHub Pages 已上線：`https://treefar.link/github-top100-zh-tw/`
- 每日台灣時間 06:17 由 GitHub Actions 更新資料並重新部署，也保留手動執行入口。
- `treefar.github.io` 導航首頁已新增入口卡片與實際首屏預覽圖，合併紀錄為 PR #2。

## 本次完成

- 新增「老師精選」導覽、首頁精選面板與適配度 5／5 金色標記。
- 適配度 4／5 顯示「高度相關」，並直接呈現個人化原因。
- 每張卡新增「下載 ZIP」、「複製 git clone」及「查看 GitHub 說明」。
- 收藏後可匯出 Windows PowerShell 批次下載腳本；腳本只處理收藏項目。
- CSV 新增 ZIP 下載網址欄位。
- 更新首頁文案、方法提醒、README 與手機版樣式。
- 修正 Windows Python 缺少 IANA `tzdata` 時無法使用 `Asia/Taipei` 的問題，改以固定 UTC+8 安全備援。
- 建置時會從 `data/top100.json` 重建 `assets/initial-data.js`，避免離線資料與正式資料不同步。

## 驗證

- `node --check assets/app.js`：通過。
- `python scripts/validate_data.py`：通過，100 筆資料、100 筆繁中摘要、排名與 Stars 排序皆正確。
- `python scripts/build_site.py`：通過，已產生 `dist/`。
- 2026-08-08 實測 `https://github.com/microsoft/vscode/archive/HEAD.zip` 回傳 302 並導向 `codeload.github.com`，直接下載格式有效。
- 2026-08-08 已更新當日 100 筆排行，包含 3 筆新進榜。
- GitHub Actions 手動部署 run `31260620750`：build 與 deploy 皆成功。
- 公開網站、treefar 首頁與預覽圖皆回傳 HTTP 200；首頁 HTML 已確認包含 `github-top100-zh-tw` 卡片。

## 已知限制

- 本輪依規範未做瀏覽器畫面點擊與多尺寸視覺 QA；語法、資料與建置已驗證。
- 新 Repository 首次 push 時因 Pages 尚未啟用而留下 1 次失敗 run；啟用 Pages 後重新執行已成功，不影響目前網站。

## 精確下一步

1. 明日 06:17 後確認第一個排程觸發的 workflow 是否成功。
2. 需要時用瀏覽器人工驗證老師精選篩選、單項 ZIP、複製 clone、收藏與 `.ps1` 匯出。
3. 新進榜目前使用規則式繁中備援；若要提高摘要品質，可設定 `OPENAI_API_KEY`，但不是網站運作必要條件。

## 禁止誤改

- 不要把排行榜解讀為「全部值得安裝」。
- 不要移除 `data/manual-overrides.json` 的個人判讀；它是老師精選與適配度的主要來源。
- 不要讓批次下載預設包含全部 100 項，避免大型儲存庫造成磁碟與網路負擔。
