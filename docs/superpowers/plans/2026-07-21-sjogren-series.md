# 修格連氏症候群 BSR 2025 指引導讀系列（sjd01–07）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 md.braintaiwan.com 新增「修格連氏症候群」分類，上線 BSR 2025 指引導讀 7 篇（sjd01–sjd07），全部斷言通過 claim-gate。

**Architecture:** 沿用既有設定驅動產線 —— 每篇文章是一個 markdown 檔，`series.json` 描述整個系列，`build.js` 讀 series.json 渲染出 HTML 並把分類區塊嵌回 `index.html`。查核以 `_gate.js` 建立 claim ledger，逐條斷言釘回 `_source.md`，由 `lib/gate.js` 的 `evaluateGate` 判定放行。

**Tech Stack:** Node.js（`build.js`、`lib/`、enhancers）、Python 3 + requests（`tools/mistral-ocr.py`）、Git。

**Spec:** `docs/superpowers/specs/2026-07-21-sjogren-series-design.md`

## Global Constraints

以下為全系列適用，每個 Task 的要求都隱含包含本節：

- **腺外表現盛行率一律採用 "at least 70%"（至少 70%）**。原文背景段寫 "affect at least 70%"、全身性治療段寫 "seen in up to 70%"，兩者方向相反；採前者，並在 sjd05 標註原文不一致。
- **神經段落不得引用 BSR 2025 指引以外的任何文獻。** 原文沒說的就不寫。
- **由 Fable 本尊起草，不外包 codex。** 既有教訓：codex 會把英文引號與亂碼寫進正文。
- **醫師小評論寫成 `### h3`**（不是 `##`，不是粗體段落）。
- **claim-gate 放行門檻為全部斷言 `SUPPORTED`。** 任何 `CONTRADICTED` 或查無出處者，須修正文章或在文中明確標註原文限制後才放行，不得以「比例夠高」放過。
- **`_source.md` 中 `<!-- page 2 -->` 的 graphical abstract 區塊不可作為字面比對來源。** OCR 把該頁圖片中的 `≥`／`≤` 轉寫為 `"> or ="`／`"< or ="`；語意無誤但字面不符，ledger 的 `sourceQuote` 必須取自正文而非該段。
- **`card.tags` 必須恰好 2 個字串**，`lib/series-schema.js` 會在 build 時驗證，少一個或多一個直接拋錯。
- **寫作風格**：依 `feedback_writing-style` —— 不用開場白、不濫用條列、不呼籲行動，避免 AI 塑膠文。
- **本次範圍不含** FB 圖卡、media 站大眾衛教版、其他系列的改動。

## File Structure

| 路徑 | 責任 |
| --- | --- |
| `D:\claudecode\sjogren-articles\_source.md` | OCR 源文，全系列唯一 ground truth |
| `D:\claudecode\sjogren-articles\_source.pdf` | 原始 PDF，供符號存疑時目視核對 |
| `D:\claudecode\sjogren-articles\01..07-*.md` | 七篇文章原稿 |
| `D:\claudecode\sjogren-articles\series.json` | 系列設定（分類、卡片、導覽） |
| `D:\claudecode\sjogren-articles\_gate.js` | claim ledger 與閘門執行器 |
| `D:\claudecode\sjogren-articles\_ledgers\01..07.json` | `_gate.js` 產出的逐篇 ledger，勿手改 |
| `D:\claudecode\sjogren-articles\_verification-report.md` | `_gate.js` 產出，勿手改 |
| `D:\claudecode\braintaiwan-md\enhance-md-footer.js` | 修改：`SERIES` map 加 `sjd` 一筆 |
| `D:\claudecode\braintaiwan-md\sjd01..07.html` | build 產物，勿手改 |
| `D:\claudecode\braintaiwan-md\index.html` | build 產物（`<!-- SERIES:sjd -->` 區塊） |

---

### Task 1: 源文準備與 OCR 引擎版本固定

**Files:**
- Create: `D:\claudecode\sjogren-articles\_source.md`
- Create: `D:\claudecode\sjogren-articles\_source.pdf`

**Interfaces:**
- Produces: `_source.md` —— 後續所有 Task 的 ledger `sourceQuote` 唯一比對來源。格式為每頁前置 `<!-- page N -->` 註解，共 33 頁。

- [ ] **Step 1: 建立目錄並以釘住的引擎重跑 OCR**

現有 `D:\claudecode\keae152.ocr.md` 是以 `mistral-ocr-latest` 產生，該別名曾自 OCR 3 移至 OCR 4，版本未留下記錄。七篇共用同一份 ground truth，來源必須可重現。

```powershell
New-Item -ItemType Directory -Force D:\claudecode\sjogren-articles
$env:MISTRAL_API_KEY = [Environment]::GetEnvironmentVariable('MISTRAL_API_KEY','User')
$env:PYTHONIOENCODING = 'utf-8'
python D:\claudecode\tools\mistral-ocr.py D:\claudecode\keae152.pdf -o D:\claudecode\sjogren-articles\_source.md
```

預期 stderr 出現：`33 pages -> D:\claudecode\sjogren-articles\_source.md [mistral-ocr-4-0]`

- [ ] **Step 2: 與舊版輸出比對**

```powershell
node -e "const fs=require('fs');const a=fs.readFileSync('D:/claudecode/keae152.ocr.md','utf8'),b=fs.readFileSync('D:/claudecode/sjogren-articles/_source.md','utf8');console.log('latest',a.length,'pinned',b.length,'identical',a===b)"
```

若 `identical false`，用 `git diff --no-index` 逐行看差異；**以釘住版本（`_source.md`）為準**。差異若涉及數字或比較符號，開啟 `_source.pdf` 對應頁目視確認後，把結論寫進 Step 3 的表頭。

- [ ] **Step 3: 在 `_source.md` 開頭寫入來源與引擎記錄**

在檔案最前面插入以下區塊（置於第一個 `<!-- page 1 -->` 之前）：

```markdown
<!--
source: Price EJ, Benjamin S, Bombardieri M, et al. British Society for Rheumatology
        guideline on management of adult and juvenile onset Sjögren disease.
        Rheumatology (Oxford). 2025;64(2):409-439. doi:10.1093/rheumatology/keae152
ocr-engine: mistral-ocr-4-0
ocr-date: 2026-07-21
caveat: <!-- page 2 --> 的 graphical abstract 為圖片，OCR 將 ≥／≤ 轉寫為
        "> or =" ／ "< or ="。語意無誤但字面不符，不可作為 ledger 的 sourceQuote 來源。
-->
```

- [ ] **Step 4: 複製原始 PDF 留存**

```powershell
Copy-Item D:\claudecode\keae152.pdf D:\claudecode\sjogren-articles\_source.pdf
```

- [ ] **Step 5: 驗證源文完整性**

```powershell
node -e "const s=require('fs').readFileSync('D:/claudecode/sjogren-articles/_source.md','utf8');console.log('pages',(s.match(/<!-- page \d+ -->/g)||[]).length);console.log('has-ocr-engine',s.includes('ocr-engine: mistral-ocr-4-0'));console.log('recommendations',(s.match(/^#+ *Recommendation/gm)||[]).length)"
```

預期輸出：`pages 33`、`has-ocr-engine true`、`recommendations 37`

三個數字任一不符就停下來查，不要往下走 —— 後面七篇都建立在這份檔案上。

- [ ] **Step 6: Commit**

`sjogren-articles` 位於 workspace 根目錄，不在 `braintaiwan-md` repo 內。確認它是否已納入版控：

```powershell
cd D:\claudecode\sjogren-articles
git status --porcelain .
```

若回傳 `fatal: not a git repository`，表示源檔目錄不受版控（與 fm-articles 等既有系列一致），跳過本步驟。若在版控內則提交：

```powershell
git add D:\claudecode\sjogren-articles\_source.md D:\claudecode\sjogren-articles\_source.pdf
git commit -m "chore(sjd): 加入 BSR 2025 Sjögren 指引源文（mistral-ocr-4-0）"
```

---

### Task 2: 產線骨架與端到端冒煙（含 sjd01）

本 Task 用第一篇走完整條產線，證明 series.json、build、index 嵌入、footer enhancer 全部接得起來，再往下複製到其餘六篇。

**Files:**
- Create: `D:\claudecode\sjogren-articles\series.json`
- Create: `D:\claudecode\sjogren-articles\01-diagnosis-classification.md`
- Create: `D:\claudecode\sjogren-articles\_gate.js`
- Modify: `D:\claudecode\braintaiwan-md\enhance-md-footer.js`（`SERIES` map）
- Output: `D:\claudecode\braintaiwan-md\sjd01.html`、`index.html`

**Interfaces:**
- Consumes: Task 1 的 `_source.md`
- Produces:
  - `series.json` —— 含全部 7 篇條目，`articles[i]` 具 `md` / `out` / `nav` / `card{cat,title,desc,tags[2]}`
  - `_gate.js` —— 匯出執行後印出 `claims=<n> supported=<n> pass=<bool> blockers=<n>`，並寫出 `_verification-report.md`
  - 後續 Task 3–8 只需在 `_gate.js` 的 `ledgers` 陣列追加物件、在 `series.json` 填該篇 card

- [ ] **Step 1: 建立 `series.json`（7 篇條目全填）**

`card.desc` 需在起草各篇後回填實際內容；此處先寫入依 spec §2 可確定的範圍描述，Task 3–8 各自更新自己那篇。`tags` 恰好 2 個。

```json
{
  "prefix": "sjd",
  "seriesTag": "修格連氏症候群臨床導讀：BSR 2025 指引",
  "srcDir": "D:/claudecode/sjogren-articles",
  "outDir": "D:/claudecode/braintaiwan-md",
  "byline": "施懿恩 醫師．神經內科 · 導讀整理 2026 年",
  "section": {
    "labelZh": "修格連氏症候群",
    "labelEn": "Sjögren Disease",
    "count": "BSR 2025 指引導讀 · 7 篇",
    "color": "green",
    "divider": "Rheumatology 2025 · BSR guideline",
    "sourceNote": "Price EJ, Benjamin S, Bombardieri M, et al. British Society for Rheumatology guideline on management of adult and juvenile onset Sjögren disease. <em>Rheumatology (Oxford)</em>. 2025;64(2):409–439. doi:10.1093/rheumatology/keae152。",
    "metaKeyword": "修格連氏症候群"
  },
  "articles": [
    {
      "md": "01-diagnosis-classification.md",
      "out": "sjd01.html",
      "nav": "① 診斷與分類準則",
      "card": {
        "cat": "導讀 ①",
        "title": "（Task 2 起草後回填）",
        "desc": "（Task 2 起草後回填）",
        "tags": ["ACR／EULAR 準則", "抗體與切片"]
      }
    },
    {
      "md": "02-lymphoma-comorbidity.md",
      "out": "sjd02.html",
      "nav": "② 淋巴瘤風險與共病篩檢",
      "card": {
        "cat": "導讀 ②",
        "title": "（Task 3 起草後回填）",
        "desc": "（Task 3 起草後回填）",
        "tags": ["淋巴瘤風險", "共病篩檢"]
      }
    },
    {
      "md": "03-dry-eye.md",
      "out": "sjd03.html",
      "nav": "③ 乾眼處置",
      "card": {
        "cat": "導讀 ③",
        "title": "（Task 4 起草後回填）",
        "desc": "（Task 4 起草後回填）",
        "tags": ["乾眼", "局部治療"]
      }
    },
    {
      "md": "04-dry-mouth-dental.md",
      "out": "sjd04.html",
      "nav": "④ 乾口與牙科預防",
      "card": {
        "cat": "導讀 ④",
        "title": "（Task 5 起草後回填）",
        "desc": "（Task 5 起草後回填）",
        "tags": ["乾口", "齲齒預防"]
      }
    },
    {
      "md": "05-systemic-neuro.md",
      "out": "sjd05.html",
      "nav": "⑤ 全身性疾病與神經侵犯",
      "card": {
        "cat": "導讀 ⑤",
        "title": "（Task 6 起草後回填）",
        "desc": "（Task 6 起草後回填）",
        "tags": ["生物製劑", "神經侵犯"]
      }
    },
    {
      "md": "06-pregnancy.md",
      "out": "sjd06.html",
      "nav": "⑥ 懷孕與胎兒心臟傳導阻滯",
      "card": {
        "cat": "導讀 ⑥",
        "title": "（Task 7 起草後回填）",
        "desc": "（Task 7 起草後回填）",
        "tags": ["anti-Ro／La", "先天性心臟阻滯"]
      }
    },
    {
      "md": "07-juvenile-followup.md",
      "out": "sjd07.html",
      "nav": "⑦ 兒童 jSD、非藥物與追蹤",
      "card": {
        "cat": "導讀 ⑦",
        "title": "（Task 8 起草後回填）",
        "desc": "（Task 8 起草後回填）",
        "tags": ["兒童 jSD", "長期追蹤"]
      }
    }
  ]
}
```

- [ ] **Step 2: 註冊 `sjd` 到 footer enhancer**

未註冊的話 `enhance-md-footer.js` 會靜默跳過整個系列（`if (!meta) { skipped++; continue; }`）。在 `SERIES` map 中依字母序插入（`se` 之後、`thy` 之前附近）：

```javascript
  sjd:  { source: 'Price EJ, Benjamin S, Bombardieri M, et al. British Society for Rheumatology guideline on management of adult and juvenile onset Sjögren disease, Rheumatology (Oxford) 2025;64(2):409–439', audience: '風濕免疫科、神經內科、眼科、口腔醫學、牙科及基層醫療人員（教學與臨床參考）' },
```

- [ ] **Step 3: 讀源文對應段落並起草 sjd01**

先讀 `_source.md` 第 215–373 行（Q1 抗體、Q2a/2b 影像、Q3a/3b 切片），以及第 116–136 行的 2016 ACR/EULAR 計分項。

建立 `01-diagnosis-classification.md`，格式如下（`title` 與 blockquote 為必要結構，`parseArticle` 靠 blockquote 抽 meta description）：

```markdown
---
title: （實際標題）
---

> **系列導讀．第 01 篇**　（一段導言，說明本篇處理範圍）

## （小節標題）

（正文）

### 施懿恩 醫師觀察

（小評論，h3）
```

本篇必須涵蓋（依 spec §2 ①）：

- 2016 ACR/EULAR 分類準則五個計分項與 ≥4 分門檻，並區分「分類準則」與「診斷」的用途差異
- ANA 與 ENA 的診斷準確度證據及品質限制
- 唾液腺超音波作為切片替代方案的定位，與其他影像模式的證據
- 大小唾液腺與淚腺切片的準確度與併發症
- BSR 這版改用 "Sjögren disease" 而非 "Sjögren's syndrome" 的用詞轉向

不得涵蓋：治療、淋巴瘤監測（分屬 sjd03–05 與 sjd02）。

- [ ] **Step 4: 建立 `_gate.js` 並寫入 sjd01 的 claim ledger**

```javascript
// 產生 claim ledgers 並跑閘門（sjd 系列）
const fs = require('fs');
const path = require('path');
const { evaluateGate } = require('D:/claudecode/braintaiwan-md/lib/gate.js');

const S = 'SUPPORTED';
const c = (sentence, claimType, value, sourceQuote, classification = S) =>
  ({ sentence, claimType, value, classification, sourceQuote });

const ledgers = [
  {
    article: '01-diagnosis-classification.md',
    claims: [
      c('2016 ACR/EULAR 分類門檻為 ≥4 分', 'cutoff', '>=4', 'Classification as SD requires a score of 4 or more'),
      c('anti-Ro 抗體計 3 分', 'criterion', '3', 'Anti-Ro antibodies (score 3)'),
      c('focus score ≥1 計 3 分', 'criterion', '3', 'Focus score of'),
      c('ANA 敏感度 58%–85%', 'percent', '58-85%', 'estimated the sensitivity of ANA as between 58% and 85%'),
      c('ANA 特異度 50%–97%', 'percent', '50-97%', 'the specificity as between 50% and 97%'),
      c('ENA 敏感度 89%–92%', 'percent', '89-92%', 'the estimated sensitivity for ENA ranged between 89% and 92%'),
      c('ENA 特異度 71%–77%', 'percent', '71-77%', 'with a specificity of 71–77%'),
      c('唇腺切片併發症最高達 20%', 'percent', '20%', 'minor complications of labial salivary gland biopsy in up to 20%'),
      // 起草完成後，把文中每一個數字、切點、準則、劑量都補進本陣列
    ],
  },
];

const dir = path.join(__dirname, '_ledgers');
fs.mkdirSync(dir, { recursive: true });
ledgers.forEach((lg, i) => {
  fs.writeFileSync(path.join(dir, `0${i + 1}.json`), JSON.stringify(lg, null, 2), 'utf8');
});

const total = ledgers.reduce((n, l) => n + l.claims.length, 0);
const supported = ledgers.reduce((n, l) => n + l.claims.filter(x => x.classification === S).length, 0);
const gate = evaluateGate(ledgers);

const lines = [
  '# sjd 系列查核報告',
  '',
  `- 來源：Price EJ, et al. *Rheumatology (Oxford)* 2025;64(2):409–439（Mistral OCR mistral-ocr-4-0 轉 markdown）`,
  `- 斷言總數：**${total}**　SUPPORTED：**${supported}**`,
  `- 閘門結果：**${gate.pass ? 'PASS' : 'BLOCKED'}**　阻擋項：${gate.blockers.length}`,
  '',
  '## 各篇斷言數',
  '',
  '| 文章 | 斷言數 | SUPPORTED |',
  '| --- | --- | --- |',
  ...ledgers.map(l => `| ${l.article} | ${l.claims.length} | ${l.claims.filter(x => x.classification === S).length} |`),
  '',
  '## 已標記之原文瑕疵（未寫入正文為事實，均於文中標記）',
  '',
  '1. 腺外表現盛行率：背景段 "affect at least 70%" vs 全身性治療段 "seen in up to 70%"，方向相反——本系列採 at least 70%，已於 sjd05 標記。',
  '2. pilocarpine 上限不一致：graphical abstract 寫 "max 5mg x 6 daily"，Q9a 正文建議寫 "5 mg tds/qds"（每日 3–4 次）——本系列採正文的 tds/qds，已於 sjd04 標記。',
];
fs.writeFileSync(path.join(__dirname, '_verification-report.md'), lines.join('\n'), 'utf8');

console.log(`claims=${total} supported=${supported} pass=${gate.pass} blockers=${gate.blockers.length}`);
if (gate.blockers.length) console.log(JSON.stringify(gate.blockers, null, 2));
```

**逐條驗證方式**：每個 `sourceQuote` 都必須能在 `_source.md` 中字面找到。用以下指令逐條確認：

```powershell
node -e "const s=require('fs').readFileSync('D:/claudecode/sjogren-articles/_source.md','utf8');const q='between 58% and 85%';console.log(s.includes(q))"
```

比對不到就代表引文抄錯、或該數字其實不在源文 —— 兩種都必須處理，不可改成近似字串硬湊。

- [ ] **Step 5: 跑閘門，確認通過**

```powershell
node D:\claudecode\sjogren-articles\_gate.js
```

預期：`claims=<n> supported=<n> pass=true blockers=0`，且 `claims === supported`。
若 `pass=false`，指令會印出 blockers 的 JSON —— 依 Global Constraints，必須修正文章或標註原文限制，不可調降門檻。

- [ ] **Step 6: Build 並確認產出**

```powershell
cd D:\claudecode\braintaiwan-md
node build.js D:\claudecode\sjogren-articles\series.json
```

預期輸出：`寫出 sjd01.html` … `寫出 sjd07.html`、`已更新 index.html 區塊 sjd`、`完成`

此時 sjd02–07 的 md 尚未建立，`build.js` 的 `renderPages` 會在 `readFileSync` 該檔時拋 `ENOENT`。因此本步驟先把 `series.json` 的 `articles` 暫時裁到只剩第一筆再跑，確認單篇通得過；Task 9 會用完整七篇重跑。

- [ ] **Step 7: 驗證 index 區塊與顏色**

```powershell
node -e "const h=require('fs').readFileSync('D:/claudecode/braintaiwan-md/index.html','utf8');console.log('marker',h.includes('<!-- SERIES:sjd START -->'));console.log('color',/topic-dot d-green[^>]*><\/span>\s*<span class=\"topic-label\">修格連氏症候群/.test(h));console.log('dup',(h.match(/修格連氏症候群 <span class=\"topic-en\">/g)||[]).length)"
```

預期：`marker true`、`color true`、`dup 1`。
`dup` 若大於 1 表示分類被重複插入 —— 停下來檢查 `applySection` 的標記是否配對正確。

- [ ] **Step 8: Commit**

```powershell
cd D:\claudecode\braintaiwan-md
git add enhance-md-footer.js sjd01.html index.html
git commit -m "feat(sjd): 新增修格連氏症候群分類與第 01 篇（診斷與分類準則）"
```

---

### Task 3: sjd02 —— 淋巴瘤風險分層、共病篩檢與早期治療

**Files:**
- Create: `D:\claudecode\sjogren-articles\02-lymphoma-comorbidity.md`
- Modify: `D:\claudecode\sjogren-articles\_gate.js`（`ledgers` 追加一筆）
- Modify: `D:\claudecode\sjogren-articles\series.json`（第 2 筆 `card.title` / `card.desc`）

**Interfaces:**
- Consumes: Task 2 的 `_gate.js` 結構與 `series.json`
- Produces: `ledgers[1]`，`article: '02-lymphoma-comorbidity.md'`

- [ ] **Step 1: 讀源文對應段落**

`_source.md` 第 374–464 行（Q4a 淋巴瘤預測標記、Q4b 疾病進展標記）、第 465–516 行（Q5 共病篩檢）、第 967–988 行（Q11 早期治療）。

- [ ] **Step 2: 起草文章**

本篇必須涵蓋（依 spec §2 ②）：

- 淋巴瘤預測生物標記，以及「早期診斷是治癒關鍵」的臨床意涵（終生風險 5–10%）
- 預測疾病進展與腺外疾病的生物標記
- 確診後應常規進行的共病檢查（甲狀腺、乳糜瀉、維生素 D 等）
- 早期治療 hypergammaglobulinaemia 或全身性疾病是否延緩進展（KISS 世代）

不得涵蓋：個別免疫抑制劑的用法（屬 sjd05）。

格式同 Task 2 Step 3（frontmatter + `> **系列導讀．第 02 篇**　…` + `### 施懿恩 醫師觀察`）。

- [ ] **Step 3: 追加 claim ledger**

在 `_gate.js` 的 `ledgers` 陣列末端追加：

```javascript
  {
    article: '02-lymphoma-comorbidity.md',
    claims: [
      c('SD 終生淋巴瘤風險 5–10%', 'percent', '5-10%', 'B-cell lymphoma (5-10% lifetime risk)'),
      c('UKPSSR 世代 22% 併存甲狀腺疾病', 'percent', '22%', '22% having co-existent thyroid disease'),
      c('緯度 >40 度地區冬季最多 30% 英國成人維生素 D 偏低', 'percent', '30%', 'up to 30% of adults in the UK having low vitamin D levels in the winter months'),
      c('KISS 世代追蹤 256 人 3 年', 'count', '256', 'followed 256 individuals with SD over 3 years'),
      c('持續高球蛋白血症與唾液流量下降相關 P = 0.008', 'statistic', 'P=0.008', 'falling salivary flow (P = 0.008)'),
      // 文中每一個數字、切點、準則都要補進本陣列
    ],
  },
```

每條 `sourceQuote` 都用 Task 2 Step 4 的 `includes` 指令逐條確認能在 `_source.md` 字面找到。

- [ ] **Step 4: 回填 series.json 第 2 筆卡片**

把 `articles[1].card.title` 與 `card.desc` 換成實際內容。`desc` 寫成 2–4 句、含具體數字的摘要（參考 fm 系列既有卡片的密度）。

- [ ] **Step 5: 跑閘門**

```powershell
node D:\claudecode\sjogren-articles\_gate.js
```

預期 `pass=true blockers=0`，且 `claims === supported`。

- [ ] **Step 6: Commit**

```powershell
cd D:\claudecode\sjogren-articles
git add 02-lymphoma-comorbidity.md _gate.js series.json _verification-report.md
git commit -m "feat(sjd): 第 02 篇 淋巴瘤風險分層與共病篩檢"
```

（若 `sjogren-articles` 不在版控內 —— 見 Task 1 Step 6 —— 跳過本步驟，改於 Task 9 一併提交 `braintaiwan-md` 的產物。）

---

### Task 4: sjd03 —— 乾眼處置

**Files:**
- Create: `D:\claudecode\sjogren-articles\03-dry-eye.md`
- Modify: `D:\claudecode\sjogren-articles\_gate.js`
- Modify: `D:\claudecode\sjogren-articles\series.json`（第 3 筆卡片）

**Interfaces:**
- Produces: `ledgers[2]`，`article: '03-dry-eye.md'`

- [ ] **Step 1: 讀源文對應段落**

`_source.md` 第 517–700 行（Q6 眼部局部治療：潤滑劑 527、血清眼藥水 553、局部類固醇 569、免疫調節/ciclosporin 583–666、meibomian 抗生素 667、脂質 675、淚點栓塞 683、雄性素 693）、第 735–752 行（Q9a 眼部刺激性治療）。

- [ ] **Step 2: 起草文章**

本篇必須涵蓋（依 spec §2 ③）：

- 潤滑劑作為第一線，以及無防腐劑劑型的理由
- 血清眼藥水、局部類固醇、免疫調節眼藥水（ciclosporin）的依序定位
- meibomian 腺體疾病的抗生素、脂質類眼藥水、淚點栓塞、雄性素補充
- 眼部刺激性治療

不得涵蓋：口腔與其他部位（屬 sjd04）。

- [ ] **Step 3: 追加 claim ledger**

在 `ledgers` 追加：

```javascript
  {
    article: '03-dry-eye.md',
    claims: [
      c('建議規律使用無防腐劑潤滑劑，每 2–3 小時一次（1, A）SOA 94.4%', 'dose', '2-3 hourly', 'Advise regular use of a preservative free lubricating eye drop (e.g. 2–3 hourly) (1, A) (SOA 94.4%)'),
      c('Cochrane 回顧納入 43 個 RCT、3497 名受試者', 'count', '43/3497', 'included 43 RCTs of 3497 participants with dry eye'),
      c('系統性回顧建議每日至少四次、持續至少一個月再評估', 'dose', '4x daily/1 month', 'use their drops at least four times daily for at least a month before reassessment'),
      c('防腐劑具毒性、促發炎與清潔劑效應', 'statement', 'preservative harm', 'the toxic, proinflammatory and detergent effects of the preservative'),
      c('HA 眼藥水統合分析納入 17 篇研究、1339 例', 'count', '17/1339', 'included 17 studies (12 parallel and 5 crossover, all randomized) and 1339 cases'),
      // 文中每一個數字、濃度、劑量、建議等級都要補進本陣列
    ],
  },
```

本篇 recommendation 密度最高（約 9 條），劑量與濃度多 —— `claimType` 用 `dose` 者屬 HIGH_RISK，`NOT_FOUND` 會直接擋，務必逐條釘回源文。

- [ ] **Step 4: 回填 series.json 第 3 筆卡片**

- [ ] **Step 5: 跑閘門**

```powershell
node D:\claudecode\sjogren-articles\_gate.js
```

預期 `pass=true blockers=0`。

- [ ] **Step 6: Commit**

```powershell
git add 03-dry-eye.md _gate.js series.json _verification-report.md
git commit -m "feat(sjd): 第 03 篇 乾眼處置"
```

---

### Task 5: sjd04 —— 乾口、其他部位乾燥與牙科預防

**Files:**
- Create: `D:\claudecode\sjogren-articles\04-dry-mouth-dental.md`
- Modify: `D:\claudecode\sjogren-articles\_gate.js`
- Modify: `D:\claudecode\sjogren-articles\series.json`（第 4 筆卡片）

**Interfaces:**
- Produces: `ledgers[3]`，`article: '04-dry-mouth-dental.md'`

- [ ] **Step 1: 讀源文對應段落**

`_source.md` 第 701–734 行（Q7 口腔、Q8 其他部位）、第 753–778 行（Q9a 口腔刺激性治療、Q9b 牙科預防）。

- [ ] **Step 2: 起草文章**

本篇必須涵蓋（依 spec §2 ④）：

- 唾液替代品與口腔照護
- 口腔刺激性治療，含 pilocarpine 的階梯式劑量
- 眼口以外黏膜乾燥的處置
- 氟化物、木糖醇、chlorhexidine、人工唾液與飲食在預防齲齒與牙周病的角色

不得重複 sjd03 的眼部內容。

- [ ] **Step 3: 追加 claim ledger**

pilocarpine 劑量務必以 `dose` 型別入帳（HIGH_RISK）。源文 summary sheet 寫 `pilocarpine 5mg once daily increasing step-wise to 5mg 3 times per day (max 5mg x 6 daily)` —— 但該段位於 `<!-- page 2 -->` graphical abstract 區塊，依 Global Constraints **不可作為 `sourceQuote`**。

**且兩處數值本身不一致**：graphical abstract 的上限是每日 6 次，Q9a 正文建議卻是 `tds/qds`（每日 3–4 次）。**採正文版本**，並在文中標註原文此處不一致。

```javascript
  {
    article: '04-dry-mouth-dental.md',
    claims: [
      c('pilocarpine 5 mg 每日一次，漸增至 5 mg tds/qds（1, A）SOA 98.4%', 'dose', '5mg od->tds/qds', 'Consider a trial of pilocarpine (5 mg once daily increasing to 5 mg tds/qds) in those with significant oral sicca symptoms with evidence of residual glandular function (1, A) (SOA 98.4%)'),
      c('兩項大型 RCT 共 629 人證實 pilocarpine 改善口乾與唾液流速', 'count', '629', 'Two large RCTs including 629 individuals with SD'),
      c('pilocarpine 副作用：流汗 43%、頻尿 10%、潮紅 10%', 'percent', '43/10/10%', 'sweating 43%, urinary frequency 10% and flushing 10%'),
      c('cevimeline 流汗較輕（11% vs 25%）但英國與歐洲未上市', 'percent', '11% vs 25%', 'less severe sweating (11% *vs* 25%)'),
      // 文中每一個數字、劑量、建議等級都要補進本陣列
    ],
  },
```

- [ ] **Step 4: 回填 series.json 第 4 筆卡片**

- [ ] **Step 5: 跑閘門**

```powershell
node D:\claudecode\sjogren-articles\_gate.js
```

預期 `pass=true blockers=0`。

- [ ] **Step 6: Commit**

```powershell
git add 04-dry-mouth-dental.md _gate.js series.json _verification-report.md
git commit -m "feat(sjd): 第 04 篇 乾口、其他乾燥與牙科預防"
```

---

### Task 6: sjd05 —— 全身性疾病用藥與神經侵犯 ★

本篇是系列的重心，也是唯一處理神經侵犯的一篇。

**Files:**
- Create: `D:\claudecode\sjogren-articles\05-systemic-neuro.md`
- Modify: `D:\claudecode\sjogren-articles\_gate.js`
- Modify: `D:\claudecode\sjogren-articles\series.json`（第 5 筆卡片）

**Interfaces:**
- Produces: `ledgers[4]`，`article: '05-systemic-neuro.md'`

- [ ] **Step 1: 讀源文對應段落**

`_source.md` 第 779–954 行（Q10a 全身性治療：傳統藥物 783、生物製劑 837–926、RSLV-132 927、雜項 935、IVIG 937、colchicine 947）、第 989–1014 行（Q12 重疊 CTD）。神經相關另讀第 181–186 行（背景段腺外表現與 QoL）、第 495 行（jSD 神經表現）、第 781 行（受累器官）。

- [ ] **Step 2: 起草文章**

本篇必須涵蓋（依 spec §2 ⑤）：

- 腺外表現整體圖像：**影響至少 70%**、15% 屬嚴重；最常受累為關節、肺、皮膚、周邊神經
- 傳統藥物：hydroxychloroquine、皮質類固醇、傳統免疫抑制劑
- 生物製劑逐一檢視：abatacept、anakinra、anti-TNF、baminercept、belimumab、epratuzumab、ianalumab、iscalimab、JAK/BTK 抑制劑、anti-ICOS ligand、tocilizumab、rituximab、RSLV-132。**重點在多數缺乏療效證據這件事本身**，不要寫成有效藥物清單
- **神經侵犯獨立成節**：周邊神經病變與病程 >10 年的關聯、neuropsychiatric 症狀的認識提升、IVIG 用於 sensorimotor 與 non-ataxic sensory neuropathy 僅 anecdotal 且不常規建議、MS 重疊僅止於 JAK-STAT 機轉推測
- 重疊 CTD（RA、SLE、scleroderma、MS）的處置原則
- **標註原文量詞矛盾**：背景段 "affect at least 70%" 與本節 "seen in up to 70%" 方向相反，本系列採前者

不得涵蓋：懷孕用藥（屬 sjd06）。

神經節嚴禁引用 BSR 2025 以外的文獻 —— 原文對神經侵犯的著墨本就有限，把它寫成「證據不足」比寫成「有這些選擇」更忠實。

- [ ] **Step 3: 追加 claim ledger**

```javascript
  {
    article: '05-systemic-neuro.md',
    claims: [
      c('腺外表現影響至少 70%', 'percent', '>=70%', 'Systemic (extraglandular) features affect at least 70%'),
      c('15% 屬嚴重', 'percent', '15%', 'are severe in 15%'),
      c('最常受累器官為關節、肺、皮膚、周邊神經', 'finding', 'joints/lungs/skin/nerves', 'Most involved organs are joints, lungs, skin and peripheral nerves'),
      c('周邊神經病變於病程 >10 年者較常見', 'finding', '>10y', 'peripheral neuropathies are more common in those with disease duration of >10 years'),
      c('IVIG 不常規建議，僅用於特定全身性併發症', 'statement', 'not routine', 'Intravenous immunoglobulins are not routinely recommended for use in SD outside of the treatment of specific systemic complications'),
      c('IVIG 建議等級 2, C，SOA 96.9%', 'criterion', '2/C/96.9%', '(2, C) (SOA 96.9%)'),
      c('IVIG 用於 SD 相關神經病變僅有 anecdotal 證據', 'statement', 'anecdotal', 'There is anecdotal evidence supporting the use of IVIG therapy in SD-associated sensorimotor and non-ataxic sensory neuropathy'),
      c('SD/SLE 重疊約 23%', 'percent', '23%', 'affects roughly 23% with an incident diagnosis of SLE'),
      c('RA 世代 1100 人中 12% 為 RA/SD 重疊', 'percent', '12%', 'of its 1100 individuals with RA, 12% had RA/SD overlap'),
      c('MS 與 SD 的關聯僅止於 JAK-STAT 路徑機轉推測', 'statement', 'hypothesis', 'JAK-STAT signalling pathways playing a role in both'),
      // 文中每一個數字、劑量、建議等級都要補進本陣列
    ],
  },
```

- [ ] **Step 4: 回填 series.json 第 5 筆卡片**

- [ ] **Step 5: 跑閘門**

```powershell
node D:\claudecode\sjogren-articles\_gate.js
```

預期 `pass=true blockers=0`。

- [ ] **Step 6: 確認量詞決策已落實**

```powershell
node -e "const s=require('fs').readFileSync('D:/claudecode/sjogren-articles/05-systemic-neuro.md','utf8');console.log('at-least',/至少\s*70\s*%/.test(s));console.log('up-to-absent',!/最多\s*70\s*%/.test(s));console.log('flagged',s.includes('up to 70%'))"
```

預期：`at-least true`、`up-to-absent true`、`flagged true`（最後一項代表文中有標註原文的不一致）。

- [ ] **Step 7: Commit**

```powershell
git add 05-systemic-neuro.md _gate.js series.json _verification-report.md
git commit -m "feat(sjd): 第 05 篇 全身性疾病用藥與神經侵犯"
```

---

### Task 7: sjd06 —— 懷孕與胎兒心臟傳導阻滯

**Files:**
- Create: `D:\claudecode\sjogren-articles\06-pregnancy.md`
- Modify: `D:\claudecode\sjogren-articles\_gate.js`
- Modify: `D:\claudecode\sjogren-articles\series.json`（第 6 筆卡片）

**Interfaces:**
- Produces: `ledgers[5]`，`article: '06-pregnancy.md'`

- [ ] **Step 1: 讀源文對應段落**

`_source.md` 第 1075–1098 行（Q16 HCQ 與低劑量 aspirin）、第 1099–1110 行（Q17 氟化類固醇與免疫球蛋白）。

- [ ] **Step 2: 起草文章**

本篇必須涵蓋（依 spec §2 ⑥）：

- anti-Ro／La 抗體與新生兒紅斑性狼瘡、先天性心臟傳導阻滯的風險諮詢
- HCQ 與低劑量 aspirin 在降低胎兒死亡率與罹病率的證據
- 已出現不完全傳導阻滯或水腫變化時，氟化類固醇與免疫球蛋白的角色

不得涵蓋：一般全身性疾病用藥（屬 sjd05）。

- [ ] **Step 3: 追加 claim ledger**

```javascript
  {
    article: '06-pregnancy.md',
    claims: [
      c('高風險妊娠建議低劑量 aspirin（1, A）SOA 93.8%', 'criterion', '1/A/93.8%', 'Recommend low dose aspirin if high risk of pre-eclampsia or high-risk pregnancy in general (1, A) (SOA 93.8%)'),
      c('anti-Ro 陽性者孕期可考慮 HCQ，依據 PATCH 研究（2, C）SOA 91.5%', 'criterion', '2/C/91.5%', 'Consider HCQ during pregnancy for those who are anti-Ro antibody positive on the basis of the risk reduction seen in the PATCH study (2, C) (SOA 91.5%)'),
      c('曾發生 CHB 者後續妊娠應提供 HCQ（1, B）SOA 96.7%', 'criterion', '1/B/96.7%', 'Offer HCQ in subsequent pregnancies to those who have experienced CHB in a previous pregnancy (1, B) (SOA 96.7%)'),
      c('統合分析納入 12 篇研究，產前氟化類固醇對已發生 CHB 的胎兒無顯著助益', 'finding', 'no benefit', 'fluorinated steroids did not provide a significant benefit in fetuses with CHB'),
      c('59 例 CHB 中，<24 週給 8 mg dexamethasone 者 29 人有 5 人緩解，對照組 0 人', 'dose', '8mg/<24wk/5of29', 'CHB resolved in 5 of the 29 treated early with 8 mg compared with none in the comparator group'),
      c('該 5 例 CHB 於產前或產後全數復發', 'finding', 'all relapsed', 'CHB reappeared in all 5 either pre- or post-natally'),
      c('偵測到 CHB 應緊急轉介專科中心評估 dexamethasone（2, C）SOA 98.9%', 'criterion', '2/C/98.9%', 'Refer urgently to specialist centre if CHB is detected for consideration of treatment with dexamethasone (2, C) (SOA 98.9%)'),
      // 文中每一個數字、劑量、建議等級都要補進本陣列
    ],
  },
```

本篇有一處需要小心處理的張力：統合分析結論是氟化類固醇**無顯著助益**，單中心研究的 5 例緩解也**全數復發**，但建議仍是緊急轉介考慮 dexamethasone，且原文明講「目前無國際共識」。不要把它寫成有效療法。

- [ ] **Step 4: 回填 series.json 第 6 筆卡片**

- [ ] **Step 5: 跑閘門**

```powershell
node D:\claudecode\sjogren-articles\_gate.js
```

預期 `pass=true blockers=0`。

- [ ] **Step 6: Commit**

```powershell
git add 06-pregnancy.md _gate.js series.json _verification-report.md
git commit -m "feat(sjd): 第 06 篇 懷孕與胎兒心臟傳導阻滯"
```

---

### Task 8: sjd07 —— 兒童 jSD、非藥物治療、長期追蹤與衛教

**Files:**
- Create: `D:\claudecode\sjogren-articles\07-juvenile-followup.md`
- Modify: `D:\claudecode\sjogren-articles\_gate.js`
- Modify: `D:\claudecode\sjogren-articles\series.json`（第 7 筆卡片）

**Interfaces:**
- Produces: `ledgers[6]`，`article: '07-juvenile-followup.md'`

- [ ] **Step 1: 讀源文對應段落**

`_source.md` 第 955–966 行（Q10b jSD 復發性腮腺炎）、第 1015–1074 行（Q13 nutraceuticals、Q14 CBT、Q15 運動）、第 1111–1156 行（Q18 追蹤、Q19 衛教）。jSD 神經與腎臟表現另見第 495 行，兒科 rituximab 使用見第 925 行。

- [ ] **Step 2: 起草文章**

本篇必須涵蓋（依 spec §2 ⑦）：

- 兒童型 SD 的表現差異（神經與腎臟表現較成人常見）、復發性腮腺炎處置、兒科用藥現況
- 營養補充品（nutraceuticals）的證據
- 認知行為介入與運動對疲勞、關節疼痛的效果
- 長期追蹤方案與個人化原則，含高淋巴瘤風險者的監測
- 年齡導向的衛教與支持資源需求

- [ ] **Step 3: 追加 claim ledger**

```javascript
  {
    article: '07-juvenile-followup.md',
    claims: [
      c('兒童 jSD 神經與腎臟表現較成人常見', 'finding', 'neuro+renal', 'children with jSD had more frequent neurologic and renal manifestations'),
      c('40% 受訪兒科醫師曾用 rituximab 治療全身性表現', 'percent', '40%', '40% of the surveyed clinicians stating that they have used it for systemic manifestations'),
      // 文中每一個數字、頻率、追蹤間隔都要補進本陣列
    ],
  },
```

- [ ] **Step 4: 回填 series.json 第 7 筆卡片**

- [ ] **Step 5: 跑閘門**

```powershell
node D:\claudecode\sjogren-articles\_gate.js
```

預期 `pass=true blockers=0`。

- [ ] **Step 6: Commit**

```powershell
git add 07-juvenile-followup.md _gate.js series.json _verification-report.md
git commit -m "feat(sjd): 第 07 篇 兒童 jSD、非藥物治療與長期追蹤"
```

---

### Task 9: 全系列建置、enhancer 與上線前驗收

**Files:**
- Modify: `D:\claudecode\sjogren-articles\series.json`（還原完整 7 筆 `articles`）
- Output: `D:\claudecode\braintaiwan-md\sjd01.html`–`sjd07.html`、`index.html`、`sitemap.xml`

**Interfaces:**
- Consumes: Task 2–8 的全部 md、`series.json`、`_gate.js`

- [ ] **Step 1: 還原 series.json 的完整 articles 陣列**

Task 2 Step 6 曾把 `articles` 裁到只剩第一筆以便冒煙測試。確認現在是完整 7 筆，且每筆 `card.title` / `card.desc` 都已回填實際內容（沒有殘留「起草後回填」字樣）：

```powershell
node -e "const s=require('D:/claudecode/sjogren-articles/series.json');console.log('count',s.articles.length);console.log('placeholders',s.articles.filter(a=>/回填/.test(a.card.title+a.card.desc)).length);console.log('tags-ok',s.articles.every(a=>a.card.tags.length===2))"
```

預期：`count 7`、`placeholders 0`、`tags-ok true`

- [ ] **Step 2: 跑全系列閘門**

```powershell
node D:\claudecode\sjogren-articles\_gate.js
```

預期 `pass=true blockers=0`，且 `claims === supported`。七篇的 ledger 都應在 `_verification-report.md` 的表格中出現。

- [ ] **Step 3: Build 全系列**

```powershell
cd D:\claudecode\braintaiwan-md
node build.js D:\claudecode\sjogren-articles\series.json
```

預期輸出 `寫出 sjd01.html` 至 `寫出 sjd07.html` 共七行，接著 `已更新 index.html 區塊 sjd`、`完成`。

- [ ] **Step 4: 依序執行三個 enhancer**

順序不可調換 —— footer 會依 `SERIES` map 補來源與對象，mobile 調整行動版樣式，seo-build 重建 sitemap。

```powershell
node enhance-md-footer.js
node enhance-md-mobile.js
node seo-build.js
```

footer enhancer 的輸出中應可見 sjd01–07 被處理（非 skipped）。若被 skip，回頭確認 Task 2 Step 2 的 `SERIES` map 是否寫進去了。

- [ ] **Step 5: 驗收產物**

```powershell
node -e "const fs=require('fs');let ok=true;for(let i=1;i<=7;i++){const f=`D:/claudecode/braintaiwan-md/sjd0${i}.html`;const h=fs.readFileSync(f,'utf8');const hasSource=h.includes('British Society for Rheumatology');const hasNav=(h.match(/class=\"series-link/g)||[]).length===7;const hasTitle=/<title>.+BrainTaiwan MD<\/title>/.test(h);if(!(hasSource&&hasNav&&hasTitle)){console.log('FAIL',f,{hasSource,hasNav,hasTitle});ok=false}}console.log('all-pages-ok',ok)"
```

預期：`all-pages-ok true`

再確認 index 與 sitemap：

```powershell
node -e "const h=require('fs').readFileSync('D:/claudecode/braintaiwan-md/index.html','utf8');console.log('dup-category',(h.match(/修格連氏症候群 <span class=\"topic-en\">/g)||[]).length);console.log('cards',(h.match(/sjd0[1-7]\.html/g)||[]).length);const m=require('fs').readFileSync('D:/claudecode/braintaiwan-md/sitemap.xml','utf8');console.log('sitemap',(m.match(/sjd0[1-7]\.html/g)||[]).length)"
```

預期：`dup-category 1`、`cards 7`、`sitemap 7`

- [ ] **Step 6: 跑既有測試套件**

```powershell
cd D:\claudecode\braintaiwan-md
npm test
```

預期全數通過。本系列未改動 `lib/`，若有測試失敗表示改到了不該改的地方。

- [ ] **Step 7: 目視檢查**

用瀏覽器開啟 `D:\claudecode\braintaiwan-md\index.html`，確認：

- 「修格連氏症候群」分類出現在最末，圓點為綠色
- 展開後七張卡片齊全，標題與摘要為實際內容
- 點入 sjd01，頁首導覽七個連結、當前篇為 active 狀態
- 頁尾出現來源與適用對象

依 CLAUDE.md，公開內容發布前需預覽驗證。

- [ ] **Step 8: Commit**

```powershell
cd D:\claudecode\braintaiwan-md
git add sjd0*.html index.html sitemap.xml enhance-md-footer.js
git commit -m "feat(sjd): 修格連氏症候群 BSR 2025 指引導讀系列上線（sjd01-07）"
```

- [ ] **Step 9: Push（需明確同意）**

依 CLAUDE.md，發布類外部副作用需在當次對話取得明確同意。**先向使用者回報驗收結果並取得同意，再執行：**

```powershell
git push origin main
```
