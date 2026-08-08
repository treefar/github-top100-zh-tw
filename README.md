# GitHub 前百大中文精選｜下載、重點與個人推薦

一個可直接部署到 **GitHub Pages** 的靜態網站。每天透過 GitHub Actions 取得累積 Stars 前 100 名 Public Repository，並顯示：

- 繁體中文功能摘要與三項重點
- 排名、Stars、每日名次與星數變化
- Repository 性質、安裝判斷、適配度 1–5、A／B／C／D 分級
- 針對 Unity、AI 程式代理、博士研究、教學及系務工作的個人化理由
- 語言、License、Topics、Forks、Issues 與最後推送時間
- 搜尋、分類、排序、收藏、卡片／精簡檢視及 CSV 匯出
- 每張卡可直接下載 ZIP、複製 `git clone`，或開啟原始 GitHub 說明
- 適配度 5／5 顯示「老師精選」，4／5 顯示「高度相關」
- 收藏多個專案後，可匯出 Windows PowerShell 批次下載腳本
- 最近 120 日排行歷史快照

> 這是「GitHub 高星儲存庫榜」，不是「最值得安裝工具榜」。Public Repository 不必然具有開源授權；正式採用前仍須閱讀 README、LICENSE、SECURITY 與 Release。

## 下載方式

- **下載 ZIP**：適合先查看內容或只使用一次，不需安裝 Git。
- **複製 git clone**：適合要持續更新、修改或參與開發的專案。
- **下載收藏清單**：先用星號收藏需要的項目，再產生 `.ps1` 腳本批次複製。腳本不會下載未收藏項目。

前百大包含大型程式庫、教材清單與倡議資料，不建議一次下載全部 100 項；先看繁中重點、個人判讀與授權提醒，再決定採用方式。

## 一、最快部署方式

### 1. 建立 GitHub Repository

在 GitHub 建立一個新 Repository，例如：

```text
github-top100-zh-tw
```

建議先設為 **Public**，可直接使用 GitHub Free 的 Pages。

### 2. 上傳本專案全部內容

不要只上傳 `dist/`，因為每日更新需要保留：

```text
.github/workflows/
scripts/
data/
assets/
index.html
README.md
```

使用 Git 指令的做法：

```bash
git init
git add .
git commit -m "feat: add GitHub Top 100 dashboard"
git branch -M main
git remote add origin https://github.com/你的帳號/github-top100-zh-tw.git
git push -u origin main
```

### 3. 啟用 GitHub Pages

進入 Repository：

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

### 4. 手動執行第一次更新

進入：

```text
Actions → 每日更新 GitHub Top 100 並部署 → Run workflow
```

完成後網站通常位於：

```text
https://你的帳號.github.io/github-top100-zh-tw/
```

## 二、每日自動更新

`.github/workflows/update-and-deploy.yml` 預設：

```yaml
- cron: "17 22 * * *"
```

這是 UTC 22:17，相當於台灣時間次日 **06:17**。刻意避開整點，降低排程壅塞機率。

每日工作流程會：

1. 呼叫 GitHub Search REST API，依累積 Stars 取得前 100 名。
2. 與昨日資料比較，計算名次與 Stars 變化。
3. 套用 `data/manual-overrides.json` 的繁中摘要與個人化判讀。
4. 對新進榜或內容明顯改變的專案，選擇性產生繁中摘要。
5. 驗證 100 筆資料完整性。
6. 把新快照提交回 Repository。
7. 建置 `dist/` 並部署到 GitHub Pages。

## 三、繁中摘要模式

### 不設定 OpenAI API Key

網站仍可正常運作：

- 排名、Stars、授權、語言、Topics 與名次變化每天更新。
- 既有 100 項人工繁中摘要會持續保留。
- 新進榜項目使用規則式繁中備援摘要，並明確提醒需閱讀 README。

這個模式完全不產生 AI API 費用。

### 設定 OpenAI API Key

進入：

```text
Settings → Secrets and variables → Actions → New repository secret
```

建立：

```text
Name: OPENAI_API_KEY
Value: 你的 OpenAI API Key
```

系統只會把 **Public Repository 的名稱、Description、Topics、語言與 License** 傳送給模型，不會傳送私人 Repository、程式碼或本機檔案。

預設模型為：

```text
gpt-5-mini
```

可在：

```text
Settings → Secrets and variables → Actions → Variables
```

新增以下 Repository Variables：

```text
OPENAI_MODEL=gpt-5-mini
MAX_AI_SUMMARIES_PER_RUN=12
```

摘要採快取優先；只有新進榜或摘要指紋改變的項目才重新產生，不會每天重算全部 100 筆。

## 四、修改個人化建議

編輯：

```text
data/manual-overrides.json
```

每個 Repository 可設定：

```json
{
  "owner/repository": {
    "category": "AI Agent／技能／提示",
    "install_action": "先評估重疊",
    "fit_score": 2,
    "grade": "C",
    "grade_label": "收藏／暫緩",
    "personal_reason": "現有工具已涵蓋多數需求。",
    "summary_zh": "繁體中文功能摘要。",
    "use_case_zh": "適合情境。",
    "caution_zh": "注意事項。",
    "locked_summary": true
  }
}
```

`locked_summary: true` 表示維持人工摘要，不因 GitHub Description 改變而覆寫。

## 五、分級原則

| 分級 | 意義 |
|---|---|
| A | 建議立即採用、確認已安裝，或持續更新 |
| B | 有明確專案與技術棧時再安裝 |
| C | 收藏、閱讀、與既有工具重疊，或暫時不需要 |
| D | 授權、安全、合法性、不相干或環境不適用，不建議 |

適配度是針對以下情境判斷，不是通用分數：

- Windows 主工作環境
- Unity、遊戲與互動原型
- Claude Code、Codex、Hermes 與 Skills 工作流
- 人工情感、LLM、情緒辨識與博士研究
- 教學、系務、招生與資料視覺化

## 六、本機預覽

直接雙擊 `index.html` 也可使用，網站會載入 `assets/initial-data.js` 的離線快照。

建議使用本機伺服器預覽完整 JSON 載入流程：

```bash
python -m http.server 8000
```

瀏覽：

```text
http://localhost:8000
```

## 七、手動更新與驗證

需要連網：

```bash
python scripts/update_rankings.py
python scripts/validate_data.py
python scripts/build_site.py
```

Windows PowerShell 可先設定：

```powershell
$env:GITHUB_TOKEN="你的 GitHub Token"
$env:OPENAI_API_KEY="你的 OpenAI API Key"  # 選用
python scripts/update_rankings.py
```

## 八、檔案結構

```text
.
├─ .github/workflows/update-and-deploy.yml
├─ assets/
│  ├─ app.js
│  ├─ styles.css
│  └─ initial-data.js
├─ data/
│  ├─ top100.json
│  ├─ history.json
│  ├─ manual-overrides.json
│  └─ summary-cache.json
├─ scripts/
│  ├─ update_rankings.py
│  ├─ validate_data.py
│  └─ build_site.py
├─ index.html
└─ README.md
```

## 九、常見問題

### Actions 顯示無法 `git push`

在 Repository：

```text
Settings → Actions → General → Workflow permissions
```

確認允許 **Read and write permissions**。若組織政策鎖定此設定，需要由組織管理員調整。

### Pages 沒有出現網址

確認：

1. `Settings → Pages` 的 Source 已選 **GitHub Actions**。
2. Actions 的 `build` 與 `deploy` 兩個 Job 都成功。
3. Repository 的預設 Branch 是 `main`。

### 排程沒有執行

GitHub 的 scheduled workflow 只會在預設 Branch 上執行。Public Repository 若長期沒有活動，排程也可能被停用；重新啟用 Workflow 或修改 cron 後再手動執行即可。

## 授權

本網站程式碼採 MIT License。排行榜資料、Repository 名稱、README、Logo 與第三方專案內容仍分別受其原始授權與服務條款約束。
