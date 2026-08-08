# GitHub 前百大中文精選：最新交接

更新時間：2026-08-08 21:38（Asia/Taipei）

## 目前狀態

- 已在既有純靜態網站上完成「下載、繁中重點、個人推薦」強化，保留原有 100 筆資料、自動更新、搜尋、分類、排序、收藏、CSV 與離線快取。
- 入口為 `index.html`，部署輸出已建置到 `dist/`。
- 尚未發布到 GitHub Pages，也未建立／連接 Git Repository。

## 本次完成

- 新增「老師精選」導覽、首頁精選面板與適配度 5／5 金色標記。
- 適配度 4／5 顯示「高度相關」，並直接呈現個人化原因。
- 每張卡新增「下載 ZIP」、「複製 git clone」及「查看 GitHub 說明」。
- 收藏後可匯出 Windows PowerShell 批次下載腳本；腳本只處理收藏項目。
- CSV 新增 ZIP 下載網址欄位。
- 更新首頁文案、方法提醒、README 與手機版樣式。

## 驗證

- `node --check assets/app.js`：通過。
- `python scripts/validate_data.py`：通過，100 筆資料、100 筆繁中摘要、排名與 Stars 排序皆正確。
- `python scripts/build_site.py`：通過，已產生 `dist/`。
- 2026-08-08 實測 `https://github.com/microsoft/vscode/archive/HEAD.zip` 回傳 302 並導向 `codeload.github.com`，直接下載格式有效。

## 已知限制

- 內建資料的排行快照日期為 2026-07-05，生成時間為 2026-08-05；正式上線前應先執行一次連網更新。
- 本輪依規範未做瀏覽器畫面點擊與多尺寸視覺 QA；語法、資料與建置已驗證。
- `assets/initial-data.js` 的內部 `meta.title` 仍是舊名稱，但不會顯示在頁面；下一次執行資料更新腳本會重建離線快照。

## 精確下一步

1. 執行 `python scripts/update_rankings.py` 取得當日排行，再重跑資料驗證與建置。
2. 用瀏覽器驗證老師精選篩選、單項 ZIP、複製 clone、收藏與 `.ps1` 匯出。
3. 建立 Git Repository 並依 README 啟用 GitHub Actions／Pages；發布前確認 Pages Source 指向正確位置。

## 禁止誤改

- 不要把排行榜解讀為「全部值得安裝」。
- 不要移除 `data/manual-overrides.json` 的個人判讀；它是老師精選與適配度的主要來源。
- 不要讓批次下載預設包含全部 100 項，避免大型儲存庫造成磁碟與網路負擔。
