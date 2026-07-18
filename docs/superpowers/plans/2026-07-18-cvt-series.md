# CVT 七篇臨床導讀系列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 AHA 2024 腦靜脈血栓科學聲明，完成七篇醫療專業導讀，通過異質審查與 claim-ledger 閘門後建置並發佈至 md.braintaiwan.com。

**Architecture:** 來源 PDF 先抽取成可追溯文字並保留頁碼，再以 `md-series` v3 建立低熵工單，交由 Codex CLI 起草、agy 異質審查、主代理仲裁。仲裁後文本才進 claim-ledger；整批通過才呼叫既有 `build.js` 產生七頁與首頁區塊，最後預覽、commit、push 與線上逐頁驗證。

**Tech Stack:** PowerShell、bundled Python + pypdf、Node.js CommonJS、`lib/hetero.js`、`lib/gate.js`、`lib/report.js`、Codex CLI、agy CLI、BrainTaiwan MD 靜態 HTML build、Browser Use／Codex in-app browser。

## Global Constraints

- 主要來源固定為 `C:/Users/ymero/Downloads/saposnik-et-al-2024-diagnosis-and-management-of-cerebral-venous-thrombosis-a-scientific-statement-from-the-american.pdf`。
- 讀者固定為神經科、急診與其他醫療專業人員；繁體中文，必要縮寫首次出現時給全名。
- 前綴固定為 `cvt`；來源目錄 `D:/claudecode/cvt-articles`；輸出 `cvt01.html`–`cvt07.html` 至 `D:/claudecode/braintaiwan-md`。
- 每篇必含 frontmatter、摘要表、至少一個臨床判讀重點、黃色 `commentary` 小評論、主要來源與醫療免責聲明。
- 不把 AHA scientific statement 稱為 guideline；不逐章翻譯、不重製 AHA 圖表、不大段引用來源。
- 所有劑量、百分比、時間、cutoff、樣本數、效果量與禁忌均列為高風險 claim；任何 `CONTRADICTED` 或高風險 `NOT_FOUND` 阻擋整批 build／push。
- 來源抽取的數字若疑似受排版影響，必須回看 PDF 原始頁面，不以抽取文字單獨定案。
- 發佈範圍只含七篇 CVT 頁面、首頁／SEO 必要變更與本計畫文件；不納入 FB、Media 或電子報內容。
- 使用者已在 2026-07-18 本對話明確要求發佈；push 前仍須完成既有醫療驗證閘門與公開頁面預覽。

---

### Task 1: 異質產線 preflight 與來源落盤

**Files:**
- Create: `D:/claudecode/cvt-articles/_source.txt`
- Create: `D:/claudecode/cvt-articles/_source-index.md`
- Read: `C:/Users/ymero/Downloads/saposnik-et-al-2024-diagnosis-and-management-of-cerebral-venous-thrombosis-a-scientific-statement-from-the-american.pdf`

**Interfaces:**
- Consumes: AHA 2024 PDF（14 頁）。
- Produces: 保留 `===== PAGE N =====` 標記的 `_source.txt`，以及七篇與頁碼對應的 `_source-index.md`。

- [ ] **Step 1: 確認工作樹與來源檔**

Run:

```powershell
git status --short
Get-Item -LiteralPath 'C:\Users\ymero\Downloads\saposnik-et-al-2024-diagnosis-and-management-of-cerebral-venous-thrombosis-a-scientific-statement-from-the-american.pdf' | Select-Object FullName,Length
```

Expected: `braintaiwan-md` 除已提交的規格／計畫外沒有未辨識變更；PDF 存在且非空。

- [ ] **Step 2: 執行 md-series v3 preflight**

Run in PowerShell; the empty pipeline closes stdin after one blank line:

```powershell
'' | codex login status
'' | agy -p 'Reply with exactly one word: OK'
```

Expected: Codex 輸出含 `Logged in`；agy 回覆恰為 `OK`。任一失敗即停下並依 `md-series` 規則詢問是否改用 `--no-hetero`，不得默默降級。

- [ ] **Step 3: 建立來源目錄並抽取逐頁文字**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'D:\claudecode\cvt-articles' | Out-Null
$env:PYTHONIOENCODING='utf-8'
& 'C:\Users\ymero\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -c "from pathlib import Path; from pypdf import PdfReader; src=Path(r'C:\Users\ymero\Downloads\saposnik-et-al-2024-diagnosis-and-management-of-cerebral-venous-thrombosis-a-scientific-statement-from-the-american.pdf'); out=Path(r'D:\claudecode\cvt-articles\_source.txt'); r=PdfReader(str(src)); out.write_text(''.join(f'\n===== PAGE {i+1} =====\n{p.extract_text() or ""}\n' for i,p in enumerate(r.pages)), encoding='utf-8'); print(f'pages={len(r.pages)} bytes={out.stat().st_size}')"
```

Expected: `pages=14` 且輸出檔大於 50 KB。

- [ ] **Step 4: 建立來源索引**

Create `_source-index.md` with these exact mappings:

```markdown
# CVT source index

- cvt01：頁 1–3；定義、流行病學、誘發因子、長期復發概覽
- cvt02：頁 1–3；臨床表現、顱內壓、癲癇、功能與職業結局
- cvt03：頁 3–5；NCCT／MRI 直接與間接徵象、靜脈性梗塞與出血
- cvt04：頁 5–6；CTV、MRV、GRE／SWI、cortical vein thrombosis、DSA
- cvt05：頁 6–7；LMWH／UFH、VKA、DOAC、RE-SPECT CVT、SECRET、ACTION-CVT
- cvt06：頁 7–8；EVT、TO-ACT、救援治療、decompressive craniectomy
- cvt07：頁 2–3、8–10；長期後遺症、兒童、妊娠／產後、未來妊娠、VITT
```

- [ ] **Step 5: 視覺核查關鍵頁面**

Open the official AHA PDF in the Codex in-app browser and inspect page 1, the risk-factor table on page 3, imaging figures on pages 4–5, the management algorithm on page 7, and key-points pages 9–10. Expected: figure labels and decimal ranges agree with `_source.txt`; record any extraction discrepancy at the top of `_source-index.md` under `## Extraction corrections`.

- [ ] **Step 6: 驗證來源落盤**

Run:

```powershell
(Select-String -LiteralPath 'D:\claudecode\cvt-articles\_source.txt' -Pattern '^===== PAGE ' -Encoding UTF8).Count
Select-String -LiteralPath 'D:\claudecode\cvt-articles\_source.txt' -Pattern '10% to 15%|RE-SPECT CVT|TO-ACT|Pregnancy and Puerperium|KEY POINTS' -Encoding UTF8
```

Expected: page marker count `14`，且五組關鍵詞皆命中。

---

### Task 2: 系列設定、風格規則與七份低熵工單

**Files:**
- Create: `D:/claudecode/cvt-articles/series.json`
- Create: `D:/claudecode/cvt-articles/_style-rules.md`
- Create: `D:/claudecode/cvt-articles/_tickets/01-ticket.txt`–`07-ticket.txt`
- Create: `D:/claudecode/cvt-articles/build-tickets.js`
- Read: `D:/claudecode/braintaiwan-md/lib/hetero.js`
- Read: `D:/claudecode/braintaiwan-md/docs/superpowers/specs/2026-07-18-cvt-series-design.md`

**Interfaces:**
- Consumes: `_source.txt`、`_source-index.md`、核准的七篇設計與 `buildDraftTicket({ briefMd, styleRulesMd, outFile })`。
- Produces: 可由 Codex CLI 獨立執行的七張工單，以及 build 可讀的 `series.json`。

- [ ] **Step 1: 建立固定風格規則**

Write `_style-rules.md` with this exact contract:

```markdown
# BrainTaiwan MD 寫作規則

- 直接進入臨床問題，不寫「在醫學的世界裡」等空泛開場。
- 以段落敘事為主；條列只用於真正需要比較或決策的資訊。
- 不呼籲按讚、分享、就醫或採取行動；結尾停在臨床判斷或證據界線。
- 不使用「深入探討」「值得注意的是」「總而言之」「不僅…更…」「讓我們」等 AI 套語。
- 不用咖啡廳聊天口吻，不戲劇化患者，不把關聯寫成因果。
- AHA 2024 文件一律稱「科學聲明」，不得稱「指引」。
- 每篇 1800–2600 個中文字，含 YAML frontmatter、摘要表、臨床判讀重點、`> 🩺 神經專科醫師　施懿恩・小評論`、主要來源與醫療免責聲明。
- 高風險數字只能使用工單所附原文；不得憑記憶補值。
```

- [ ] **Step 2: 建立 `series.json`**

Use prefix `cvt`, byline `施懿恩 醫師．神經內科 · 導讀整理 2026 年`, section labels `腦中風`／`Stroke`, count `腦靜脈血栓 CVT 導讀 · 7 篇`, color `auto`, divider `AHA Scientific Statement 2024 · Saposnik et al.`, and source note containing the full Stroke citation and DOI. Article mappings must be:

```text
01-when-to-suspect-cvt.md -> cvt01.html -> ① 何時懷疑 CVT
02-clinical-presentation.md -> cvt02.html -> ② 臨床表現與風險
03-imaging-clues.md -> cvt03.html -> ③ 影像線索與陷阱
04-confirming-diagnosis.md -> cvt04.html -> ④ CTV／MRV 確診
05-anticoagulation.md -> cvt05.html -> ⑤ 抗凝治療證據
06-rescue-therapy.md -> cvt06.html -> ⑥ EVT／減壓救援
07-special-populations.md -> cvt07.html -> ⑦ 特殊族群與追蹤
```

Each card must have a unique `cat`, title, 80–150 字 description, and two clinically specific tags.

- [ ] **Step 3: 建立工單產生器**

`build-tickets.js` must import `buildDraftTicket` from `D:/claudecode/braintaiwan-md/lib/hetero.js`, read `_style-rules.md`, and generate seven tickets. Each brief must include: article title, exact source pages, scope bullets from the approved design, at least five verbatim source sentences kept under the source-only audit artifact, forbidden adjacent topics, output length, mandatory sections, and the exact output filename.

- [ ] **Step 4: 執行工單產生器**

Run:

```powershell
& 'C:\Users\ymero\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\claudecode\cvt-articles\build-tickets.js'
```

Expected: prints `tickets=7` and creates seven nonempty ticket files.

- [ ] **Step 5: 驗證設定與工單契約**

Run:

```powershell
& 'C:\Users\ymero\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' -e "const s=require('D:/claudecode/cvt-articles/series.json'); if(s.prefix!=='cvt'||s.articles.length!==7||new Set(s.articles.map(a=>a.out)).size!==7)process.exit(1); console.log('series-ok')"
Get-ChildItem -LiteralPath 'D:\claudecode\cvt-articles\_tickets' -Filter '*-ticket.txt' | ForEach-Object { if ($_.Length -eq 0) { throw \"empty ticket: $($_.Name)\" } }
```

Expected: `series-ok` and no exception.

---

### Task 3: Codex CLI 起草七篇文章

**Files:**
- Create: `D:/claudecode/cvt-articles/01-when-to-suspect-cvt.md`
- Create: `D:/claudecode/cvt-articles/02-clinical-presentation.md`
- Create: `D:/claudecode/cvt-articles/03-imaging-clues.md`
- Create: `D:/claudecode/cvt-articles/04-confirming-diagnosis.md`
- Create: `D:/claudecode/cvt-articles/05-anticoagulation.md`
- Create: `D:/claudecode/cvt-articles/06-rescue-therapy.md`
- Create: `D:/claudecode/cvt-articles/07-special-populations.md`

**Interfaces:**
- Consumes: `_tickets/NN-ticket.txt`。
- Produces: 七篇含完整結構的 markdown 初稿。

- [ ] **Step 1: 以最多三個並行程序起草 01–03**

For each ticket, run from `D:/claudecode/cvt-articles`; the empty pipeline closes stdin after one blank line:

```powershell
'' | codex exec --skip-git-repo-check -s workspace-write '讀取本目錄的 _tickets/01-ticket.txt，依工單內容執行。'
'' | codex exec --skip-git-repo-check -s workspace-write '讀取本目錄的 _tickets/02-ticket.txt，依工單內容執行。'
'' | codex exec --skip-git-repo-check -s workspace-write '讀取本目錄的 _tickets/03-ticket.txt，依工單內容執行。'
```

Expected: each target markdown exists and is nonempty. Retry a failed article once; after two failures, the primary agent writes it and records the fallback in `_review-ledger.md`.

- [ ] **Step 2: 起草 04–06**

Repeat the exact command form for tickets `04`, `05`, and `06`, retaining the required `-s workspace-write` and closed stdin.

- [ ] **Step 3: 起草 07**

Repeat the exact command form for ticket `07`.

- [ ] **Step 4: 執行結構檢查**

Run:

```powershell
$files=Get-ChildItem -LiteralPath 'D:\claudecode\cvt-articles' -Filter '0*.md' | Sort-Object Name
if($files.Count -ne 7){throw "expected 7 drafts"}
foreach($f in $files){$t=Get-Content -Raw -Encoding UTF8 -LiteralPath $f.FullName; foreach($needle in @('---','# ','|','🩺','主要來源','免責聲明')){if(-not $t.Contains($needle)){throw "$($f.Name) missing $needle"}}}
```

Expected: no exception.

---

### Task 4: agy 異質審查與主代理仲裁

**Files:**
- Create: `D:/claudecode/cvt-articles/_review/01-input.md`–`07-input.md`
- Create: `D:/claudecode/cvt-articles/_review/01-raw.txt`–`07-raw.txt`
- Create: `D:/claudecode/cvt-articles/_review/01-issues.json`–`07-issues.json`
- Create: `D:/claudecode/cvt-articles/build-review.js`
- Create: `D:/claudecode/cvt-articles/_review-ledger.md`
- Modify: `D:/claudecode/cvt-articles/01-when-to-suspect-cvt.md`–`07-special-populations.md`

**Interfaces:**
- Consumes: `buildReviewPrompt({ draftMd, briefMd, sourceExcerpt, styleRulesMd })`、七篇初稿與對應來源頁。
- Produces: 結構化審查意見、逐條 ACCEPT／REJECT 仲裁，以及仲裁後文章。

- [ ] **Step 1: 產生七份 review input**

`build-review.js` must call `buildReviewPrompt` with the full draft, its ticket brief, only the indexed source pages, and the full `_style-rules.md`. Run it and expect `review-inputs=7`.

- [ ] **Step 2: 以 stdin 管入 agy 審查**

For each article, pipe the full input file through stdin:

```powershell
Get-Content -Raw -Encoding UTF8 -LiteralPath 'D:\claudecode\cvt-articles\_review\01-input.md' | agy -p '依 stdin 內容中的指示輸出 JSON。' | Set-Content -Encoding UTF8 -LiteralPath 'D:\claudecode\cvt-articles\_review\01-raw.txt'
```

Repeat for `02`–`07`. Do not ask agy to read a local path. If parsing fails, retry once with the JSON contract appended to the prompt; after two failures, mark that article `⚠ 未經異質審查` in `_review-ledger.md` without blocking the medical claim gate.

- [ ] **Step 3: 解析 review issues**

Use `parseReviewIssues(raw)` from `lib/hetero.js` and write one normalized JSON array per article. Expected: all parsable files contain arrays; no raw Markdown fence remains.

- [ ] **Step 4: 仲裁每一條 issue**

Create `_review-ledger.md` with columns `article | quote | type | severity | decision | reason | actual change`. The primary agent must mark every issue `ACCEPT` or `REJECT`; accepted issues are edited directly into the corresponding markdown once, using the source as highest authority and `_style-rules.md` for style decisions.

- [ ] **Step 5: 驗證仲裁完整性**

Run a deterministic script that compares total parsed issue count with ledger decision rows. Expected: counts match and every row has a nonempty reason; re-run the structural check from Task 3 Step 4 after edits.

---

### Task 5: Claim ledger 與整批醫療閘門

**Files:**
- Create: `D:/claudecode/cvt-articles/_ledgers/01.json`–`07.json`
- Create: `D:/claudecode/cvt-articles/run-gate.js`
- Create: `D:/claudecode/cvt-articles/_verification-report.md`
- Modify: Article markdown only when resolving a blocked claim.

**Interfaces:**
- Consumes: 仲裁後七篇、`_source.txt`、`evaluateGate(ledgers, { noGate:false })`、`renderReport(ledgers, gate)`。
- Produces: 七份 `{ article, claims[] }` ledger 和 `gate.pass === true` 的報告。

- [ ] **Step 1: 以三篇、三篇、一篇三波分派 claim 驗證**

Use fresh verifier subagents as required by `md-series`: wave 1 verifies 01–03, wave 2 verifies 04–06, wave 3 verifies 07. Each verifier must read only its final article plus `_source.txt`, extract every checkable assertion, and write objects with exact keys:

```json
{
  "sentence": "article claim",
  "claimType": "dose|percent|cutoff|criterion|epidemiology|drugName|other",
  "value": "the value or concept being checked",
  "classification": "SUPPORTED|NOT_FOUND|CONTRADICTED",
  "sourceQuote": "supporting source sentence with page marker"
}
```

SUPPORTED and CONTRADICTED claims require a nonempty `sourceQuote`; all numeric, timing, dose, criterion, contraindication, efficacy and safety claims are high risk.

- [ ] **Step 2: 執行整批 gate 與報告產生器**

`run-gate.js` must load all seven ledgers, call `evaluateGate(ledgers,{noGate:false})`, write `renderReport(ledgers,gate)` to `_verification-report.md`, print JSON summary, and exit `1` when `gate.pass` is false.

Run:

```powershell
& 'C:\Users\ymero\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\claudecode\cvt-articles\run-gate.js'
```

Expected: exit `0`, `pass=true`, `contradicted=0`, `blockingNotFound=0`.

- [ ] **Step 3: 修正被阻擋項並重驗**

If the gate fails, edit the article to match the source or remove the unsupported high-risk assertion, then send only the changed article to a fresh verifier and rerun `run-gate.js`. Do not build or publish until the expected Task 5 Step 2 output is achieved.

- [ ] **Step 4: 人工抽查高風險表格**

Check every claim in cvt05, cvt06, and cvt07 whose type is `dose`, `percent`, `cutoff`, or `criterion` against the original PDF page screenshot. Expected: exact agreement in number, unit, population, comparison group, and uncertainty interval.

---

### Task 6: Build、測試與輸出範圍檢查

**Files:**
- Create: `D:/claudecode/braintaiwan-md/cvt01.html`–`cvt07.html`
- Modify: `D:/claudecode/braintaiwan-md/index.html`
- Modify: `D:/claudecode/braintaiwan-md/sitemap.xml` only if the existing SEO build does so deterministically.

**Interfaces:**
- Consumes: gate 通過的七篇 markdown 與 `series.json`。
- Produces: 七個可部署 HTML 頁面、首頁系列區塊與正確 SEO metadata。

- [ ] **Step 1: 先跑既有測試基線**

Run:

```powershell
npm test
```

Expected: all existing Node tests pass before build.

- [ ] **Step 2: 執行通用 build**

Run:

```powershell
& 'C:\Users\ymero\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\claudecode\braintaiwan-md\build.js' 'D:\claudecode\cvt-articles\series.json'
```

Expected: seven pages written, `SERIES:cvt START/END` block added once, and details balance validation passes.

- [ ] **Step 3: 執行 SEO build if required by existing package workflow**

Inspect `seo-build.js` usage in recent commits. If the repository's established publish sequence runs it, execute it once and retain only deterministic `cvt`/sitemap changes; otherwise leave unrelated SEO outputs untouched.

- [ ] **Step 4: 重跑完整測試與靜態檢查**

Run:

```powershell
npm test
git diff --check
Select-String -LiteralPath 'index.html' -Pattern '<!-- SERIES:cvt START -->','<!-- SERIES:cvt END -->'
```

Expected: all tests pass, no whitespace errors, exactly one start and one end marker.

- [ ] **Step 5: 驗證七頁 metadata 與連結**

Run a Node script that loads `cvt01.html`–`cvt07.html` and asserts each has unique `<title>`, matching canonical/OG URL, `lang="zh-TW"`, byline, series navigation, disclaimer, and no `�` replacement character. It must also assert all previous/next href targets exist.

- [ ] **Step 6: 檢查 Git 範圍**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only the plan file, `cvt01.html`–`cvt07.html`, `index.html`, and a deterministic `sitemap.xml` change if generated; no unrelated user files are staged or modified.

---

### Task 7: 桌面／行動預覽與內容抽查

**Files:**
- Read: `D:/claudecode/braintaiwan-md/index.html`
- Read: `D:/claudecode/braintaiwan-md/cvt01.html`–`cvt07.html`
- Create: temporary browser screenshots under the Browser Use workspace only.

**Interfaces:**
- Consumes: Task 6 build output。
- Produces: 無破版、無錯鏈、無內容截斷的預覽驗證結果。

- [ ] **Step 1: 啟動本機靜態伺服器**

Run a local HTTP server from `D:/claudecode/braintaiwan-md` on an available loopback port. Expected: `index.html` and all seven `cvtNN.html` return HTTP 200.

- [ ] **Step 2: 依 Browser Use 規則先截圖再檢查桌面版**

At approximately 1440×1000, inspect the CVT homepage block and all seven articles. Check header, title, table width, commentary styling, source section, disclaimer, footer, series nav, previous/next links, and Chinese glyphs.

- [ ] **Step 3: 檢查行動版**

At approximately 390×844, inspect the homepage CVT block plus cvt03, cvt05, and cvt07 (the densest imaging, treatment, and special-population articles). Expected: no horizontal overflow, clipped tables, overlapping pager, or unreadable text.

- [ ] **Step 4: 修正並重驗任何視覺缺陷**

Use the smallest scoped content or shared-template-compatible fix. Rebuild if source markdown changes, rerun Task 6 checks, then repeat the affected screenshots until zero visual defect remains.

---

### Task 8: 原子提交、push 與線上逐頁驗證

**Files:**
- Stage: `docs/superpowers/plans/2026-07-18-cvt-series.md`
- Stage: `cvt01.html`–`cvt07.html`
- Stage: `index.html`
- Stage: `sitemap.xml` only if changed by the established build.

**Interfaces:**
- Consumes: gate pass report、green tests、clean preview 與已核准的發佈授權。
- Produces: `https://md.braintaiwan.com/cvt01.html`–`cvt07.html` 七個公開頁面。

- [ ] **Step 1: 最終完成聲明前驗證**

Invoke `superpowers:verification-before-completion`, rerun `npm test`, `git diff --check`, the metadata/link checker, and confirm `_verification-report.md` still says pass. Expected: all checks fresh and green.

- [ ] **Step 2: 只 stage 本系列檔案**

Run explicit `git add --` paths for the plan, seven pages, `index.html`, and conditional `sitemap.xml`. Then run `git diff --cached --name-only` and compare against the allowlist.

- [ ] **Step 3: 建立原子 commit**

Run:

```powershell
git commit -m "新增 CVT 七篇臨床導讀系列"
```

Expected: one commit containing only the allowlisted site files.

- [ ] **Step 4: Push 至正式站來源分支**

Run:

```powershell
git push origin main
```

Expected: push succeeds. If network or authentication fails, retain the local commit and report the exact failure without destructive retry.

- [ ] **Step 5: 等待部署後逐頁驗證**

Using the Codex in-app browser, open the homepage and each of:

```text
https://md.braintaiwan.com/cvt01.html
https://md.braintaiwan.com/cvt02.html
https://md.braintaiwan.com/cvt03.html
https://md.braintaiwan.com/cvt04.html
https://md.braintaiwan.com/cvt05.html
https://md.braintaiwan.com/cvt06.html
https://md.braintaiwan.com/cvt07.html
```

Expected: HTTP 200, correct unique title, visible 2026 byline, working series navigation, homepage card links, no stale 404 or old content. Poll with reasonable backoff while deployment is pending.

- [ ] **Step 6: 最終回報**

Report the seven public URLs, commit hash, test result, claim-gate summary, any agy review fallback, and confirmation that desktop/mobile previews passed. Do not claim publication until all seven online pages are verified.
