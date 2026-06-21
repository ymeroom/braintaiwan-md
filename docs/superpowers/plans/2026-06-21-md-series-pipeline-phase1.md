# MD 產線 Phase 1（設定驅動產生器）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 22 支重複的 `build-*.js` 收斂成一支讀 `series.json` 的通用產生器，能渲染文章頁並自動插入/更新 `index.html` 區塊（自動選色、結構驗證、冪等），新系列只需一份設定檔。

**Architecture:** 三個聚焦檔案——`lib/md-render.js`（純 markdown→HTML，自 `build-phn.js` 抽出）、`lib/apply-index.js`（index 區塊插入/選色/驗證）、`build.js`（CLI：讀 series.json → 渲染頁面 → 套用 index）。以既有 `cidp01-10.html` 做黃金測試鎖定渲染保真度。

**Tech Stack:** Node.js 24（CommonJS）、內建 `node:test` + `node:assert`（零外部相依）。

## Global Constraints

- Node 執行環境：CommonJS（`require`/`module.exports`），不引入外部套件。
- 測試框架：Node 內建 `node:test`，以 `node --test` 執行。
- 既有 22 支 `build-*.js` 一律不修改、不刪除——只新增通用路徑。
- 渲染輸出必須與既有 `cidp01-10.html` **逐位元組相符**（黃金測試強制）。
- 字串常數（SERIES_TAG、byline）一律來自 `series.json`，不在程式碼硬寫。
- 8 色盤固定為：`amber, blue, coral, green, indigo, purple, red, teal`（dot/banner/tag 同名）。
- index 區塊標記格式固定為 `<!-- SERIES:<prefix> START -->` / `<!-- SERIES:<prefix> END -->`。
- 檔案編碼一律 UTF-8、LF 結尾（與既有產出一致）。

---

### Task 1: 測試骨架 + 抽出 `lib/md-render.js`（純渲染器）

**Files:**
- Create: `package.json`
- Create: `lib/md-render.js`
- Create: `test/md-render.test.js`

**Interfaces:**
- Produces:
  - `escapeHtml(s: string) -> string`
  - `renderInline(s: string) -> string`
  - `renderBlocks(lines: string[]) -> string`
  - `parseArticle(src: string) -> { title: string, desc: string, body: string }`

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "braintaiwan-md-build",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 寫失敗測試 `test/md-render.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { escapeHtml, renderInline, renderBlocks, parseArticle } = require('../lib/md-render');

test('escapeHtml escapes &, <, >', () => {
  assert.strictEqual(escapeHtml('a & b <c>'), 'a &amp; b &lt;c&gt;');
});

test('renderInline handles bold, em, code, link', () => {
  assert.strictEqual(renderInline('**b** *i* `c`'), '<strong>b</strong> <em>i</em> <code>c</code>');
  assert.strictEqual(renderInline('[t](u)'), '<a href="u">t</a>');
});

test('renderBlocks renders a table', () => {
  const out = renderBlocks(['| A | B |', '|---|---|', '| 1 | 2 |']);
  assert.match(out, /<table>/);
  assert.match(out, /<th>A<\/th><th>B<\/th>/);
  assert.match(out, /<td>1<\/td><td>2<\/td>/);
});

test('renderBlocks tags commentary blockquote', () => {
  const out = renderBlocks(['> 🩺 小評論', '> 內容']);
  assert.match(out, /blockquote class="commentary"/);
});

test('parseArticle extracts title, drops first H1, builds desc from blockquote', () => {
  const src = '---\ntitle: "測試標題"\n---\n\n# 測試標題\n\n> **系列導讀．第 1 篇** 這是引言內容\n\n本文。\n';
  const r = parseArticle(src);
  assert.strictEqual(r.title, '測試標題');
  assert.ok(!r.body.includes('<h1>'), '首個 H1 應被移除');
  assert.match(r.desc, /這是引言內容/);
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `node --test test/md-render.test.js`
Expected: FAIL —「Cannot find module '../lib/md-render'」

- [ ] **Step 4: 建立 `lib/md-render.js`（自 `build-phn.js` 抽出）**

把 `build-phn.js` 第 18–133 行的 `esc`、`inline`、`renderBlocks`、`parse` 四個函式**逐字複製**到新檔 `lib/md-render.js`，將 `esc`→`escapeHtml`、`inline`→`renderInline`、`parse`→`parseArticle` 改名（函式體內呼叫一併改名），其餘邏輯一字不改，檔尾加上匯出。完整內容如下：

```js
// 站內極簡 markdown 轉換器（自 build-phn.js 抽出，純函式、無相依）
function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderInline(s){
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m,c)=>{ codes.push(c); return `\x00${codes.length-1}\x00`; });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\x00(\d+)\x00/g, (m,i)=>`<code>${escapeHtml(codes[+i])}</code>`);
  return s;
}

function renderBlocks(lines){
  let html = '';
  let i = 0;
  while (i < lines.length){
    let line = lines[i];
    if (/^\s*$/.test(line)){ i++; continue; }
    if (/^---\s*$/.test(line)){ html += '<hr>\n'; i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))){
      const lvl = m[1].length;
      html += `<h${lvl}>${renderInline(m[2].trim())}</h${lvl}>\n`;
      i++; continue;
    }
    if (/^>/.test(line)){
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])){ buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      const raw = buf.join('\n');
      const cls = raw.includes('🩺') ? ' class="commentary"' : '';
      html += `<blockquote${cls}>\n${renderBlocks(buf)}</blockquote>\n`;
      continue;
    }
    if (line.includes('|') && i+1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1]) && lines[i+1].includes('-')){
      const rows = [];
      while (i < lines.length && lines[i].includes('|')){ rows.push(lines[i]); i++; }
      const cells = r => r.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      let t = '<table>\n<thead><tr>' + head.map(c=>`<th>${renderInline(c)}</th>`).join('') + '</tr></thead>\n<tbody>\n';
      for (const r of body){ t += '<tr>' + r.map(c=>`<td>${renderInline(c)}</td>`).join('') + '</tr>\n'; }
      t += '</tbody></table>\n';
      html += t; continue;
    }
    if (/^\d+\.\s+/.test(line)){
      let l = '<ol>\n';
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])){ l += `<li>${renderInline(lines[i].replace(/^\d+\.\s+/,''))}</li>\n`; i++; }
      l += '</ol>\n'; html += l; continue;
    }
    if (/^[-*]\s+/.test(line)){
      let l = '<ul>\n';
      while (i < lines.length && /^[-*]\s+/.test(lines[i])){ l += `<li>${renderInline(lines[i].replace(/^[-*]\s+/,''))}</li>\n`; i++; }
      l += '</ul>\n'; html += l; continue;
    }
    const p = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,3}\s|>|---\s*$|\d+\.\s|[-*]\s)/.test(lines[i])
           && !(lines[i].includes('|') && i+1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1]))){
      p.push(lines[i]); i++;
    }
    if (p.length) html += `<p>${renderInline(p.join(' '))}</p>\n`;
  }
  return html;
}

function parseArticle(src){
  let title = '';
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm){
    const t = fm[1].match(/title:\s*"?(.*?)"?\s*$/m);
    if (t) title = t[1];
    src = src.slice(fm[0].length);
  }
  const lines = src.split(/\r?\n/);
  const h1 = lines.findIndex(l => /^#\s+/.test(l));
  if (h1 !== -1) lines.splice(h1, 1);
  let desc = '';
  const bqStart = lines.findIndex(l => /^>/.test(l));
  if (bqStart !== -1){
    let j = bqStart; const buf = [];
    while (j < lines.length && /^>/.test(lines[j])){ buf.push(lines[j].replace(/^>\s?/, '')); j++; }
    desc = buf.join(' ')
      .replace(/[*_`>#]/g, '')
      .replace(/系列導讀．第\s*\d+\s*篇/, '')
      .replace(/^[\s　]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (desc.length > 110) desc = desc.slice(0, 110) + '…';
  }
  return { title, desc, body: renderBlocks(lines) };
}

module.exports = { escapeHtml, renderInline, renderBlocks, parseArticle };
```

- [ ] **Step 5: 執行測試確認通過**

Run: `node --test test/md-render.test.js`
Expected: PASS（5 tests）

- [ ] **Step 6: Commit**

```bash
git add package.json lib/md-render.js test/md-render.test.js
git commit -m "feat: 抽出共用 markdown 渲染器 lib/md-render.js + 測試骨架"
```

---

### Task 2: `build.js` 頁面渲染 + cidp 黃金測試

**Files:**
- Create: `D:/claudecode/cidp-articles/series.json`
- Create: `build.js`
- Create: `test/build-golden.test.js`

**Interfaces:**
- Consumes: `parseArticle` from `lib/md-render`
- Produces:
  - `loadSeries(jsonPath: string) -> Series`（解析後物件，含絕對化的 `srcDir`/`outDir`）
  - `renderPage(parsed: {title,desc,body}, series: Series, activeIdx: number) -> string`
  - `renderPages(series: Series) -> Array<{ out: string, html: string }>`
  - `Series` 形狀：`{ prefix, seriesTag, srcDir, outDir, byline, section, articles: [{md,out,nav,card}] }`

- [ ] **Step 1: 建立 `D:/claudecode/cidp-articles/series.json`**

依現有 `build-cidp.js` 的 `articles` 陣列與 `SERIES_TAG`、byline 填入；`card` 內容取自目前 `index.html` 既有的 cidp 卡片文字（Task 5 會用到，此處先備齊）。

```json
{
  "prefix": "cidp",
  "seriesTag": "CIDP 慢性發炎性脫髓鞘多發性神經根神經病臨床導讀",
  "srcDir": "D:/claudecode/cidp-articles",
  "outDir": "D:/claudecode/braintaiwan-md",
  "byline": "施懿恩 醫師．神經內科 · 導讀整理 2026 年",
  "section": {
    "labelZh": "周邊神經",
    "labelEn": "Peripheral Nerve",
    "count": "CIDP 導讀 · 10 篇",
    "color": "green",
    "divider": "EAN/PNS 2021 指引 · van Doorn 2024 · Kiers 2025",
    "sourceNote": "Van den Bergh PYK, et al. EAN/PNS guideline on diagnosis and treatment of CIDP — Second revision. <em>J Peripher Nerv Syst</em> 2021;26:242–268；van Doorn IN, et al. <em>Ther Clin Risk Manag</em> 2024;20:111–126；Kiers L, Cruse B. <em>BMJ Neurol Open</em> 2025;7:e001318。",
    "metaKeyword": "周邊神經（CIDP）"
  },
  "articles": [
    { "md": "01-what-is-cidp.md", "out": "cidp01.html", "nav": "① 認識 CIDP", "card": { "cat": "導讀 ①", "title": "認識 CIDP：被慢慢剝外皮的電線", "desc": "病名拆解、免疫攻擊髓鞘的機轉（巨噬細胞＋補體）、軸突損傷不可逆的時間壓力，以及「會被誤診、近半轉診其實是別的病」這個貫穿全系列的核心。", "tags": ["疾病概念","免疫機轉"] } },
    { "md": "02-typical-and-variants.md", "out": "cidp02.html", "nav": "② 典型與變異型", "card": { "cat": "導讀 ②", "title": "典型 CIDP 與五種變異型", "desc": "典型表型三條件、A-CIDP（像 GBS 的 13%）、遠端 DADS／多灶 MADSAM／局灶／運動／感覺五型的長相與最易被認錯的對象，以及「運動型勿先用類固醇」的伏筆。", "tags": ["臨床分型","MADSAM"] } },
    { "md": "03-mimics-and-spectrum.md", "out": "cidp03.html", "nav": "③ 模仿者與光譜", "card": { "cat": "導讀 ③", "title": "長得像卻不是：模仿者與光譜", "desc": "2021 把自體免疫結性神經病（anti-NF155/CNTN1/Caspr1）、CISP、anti-MAG 神經病請出 CIDP——機轉不同、對 IVIg 差、可能對 rituximab 好，以及「慢性自體免疫神經病」光譜概念。", "tags": ["nodopathy","鑑別診斷"] } },
    { "md": "04-nerve-conduction.md", "out": "cidp04.html", "nav": "④ 神經傳導", "card": { "cat": "導讀 ④", "title": "神經傳導：核心工具與判讀陷阱", "desc": "運動與感覺脫髓鞘準則、感覺準則升級、sural sparing；以及最關鍵的 1.0 mV 紅線——軸突流失偽裝成脫髓鞘，是過度診斷的主因。測夠廣、上肢近端最易找到病灶。", "tags": ["電生理","NCS"] } },
    { "md": "05-diagnostic-algorithm.md", "out": "cidp05.html", "nav": "⑤ 診斷流程", "card": { "cat": "導讀 ⑤", "title": "把線索拼成診斷：EAN/PNS 2021 流程", "desc": "臨床＋電生理＋支持證據三層拼圖、確定度砍成 CIDP／possible 兩級、possible 靠兩項支持準則升級（部分格子不可升級），以及客觀治療反應要雙向、謹慎解讀。", "tags": ["診斷流程","possible CIDP"] } },
    { "md": "06-ancillary-tests.md", "out": "cidp06.html", "nav": "⑥ 輔助檢查", "card": { "cat": "導讀 ⑥", "title": "輔助檢查：誰該做、誰是陷阱", "desc": "CSF 蛋白-細胞分離（非專屬、隨年齡漂移）、神經超音波（近端肥大、納入支持準則）、MRI、神經切片的取捨，以及「所有人都該做單株蛋白篩檢、看情況驗結旁抗體」。", "tags": ["輔助檢查","M-protein"] } },
    { "md": "07-first-line-treatment.md", "out": "cidp07.html", "nav": "⑦ 第一線治療", "card": { "cat": "導讀 ⑦", "title": "第一線三本柱：IVIg／類固醇／血漿置換", "desc": "八成有反應；IVIg 快但貴、類固醇便宜但慢且運動型可能惡化、血漿置換當救援。選柱子是「對到病人」而非比強弱，外加別忘了處理神經痛。", "tags": ["第一線","IVIg"] } },
    { "md": "08-maintenance-and-outcome.md", "out": "cidp08.html", "nav": "⑧ 維持與評估", "card": { "cat": "導讀 ⑧", "title": "維持治療與「客觀評估」", "desc": "SCIg 在家自打、定期減量試驗對抗過度治療、「症狀穩定≠有效」、誤診者 85% 自覺變好的陷阱，以及 I-RODS／INCAT／MRC／握力與 MCID 的用法與天花板效應。", "tags": ["維持治療","客觀量表"] } },
    { "md": "09-refractory-cidp.md", "out": "cidp09.html", "nav": "⑨ 難治型", "card": { "cat": "導讀 ⑨", "title": "難治型 CIDP：先回頭看診斷", "desc": "20–30% 反應不佳、15% 全頑強；第一步永遠是重檢診斷（近半是別的病）。MADSAM/DADS 本就較難治、IVIg 反應多在 6–8 週內，第二線 rituximab／MMF／cyclophosphamide／HSCT 證據皆不強。", "tags": ["難治型","第二線"] } },
    { "md": "10-future-therapies.md", "out": "cidp10.html", "nav": "⑩ 未來新藥", "card": { "cat": "導讀 ⑩", "title": "對準機轉的新一代武器", "desc": "FcRn 抑制劑（efgartigimod ADHERE 陽性、rozanolixizumab 陰性）、補體抑制劑（riliprubart）、CAR-T；以及「CIDP 是異質光譜、缺生物標記」這個讓精準治療難以對人的根本課題。", "tags": ["標靶治療","FcRn／補體"] } }
  ]
}
```

- [ ] **Step 2: 寫黃金測試 `test/build-golden.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadSeries, renderPages } = require('../build');

test('renderPages reproduces committed cidp01-10.html byte-for-byte', () => {
  const series = loadSeries('D:/claudecode/cidp-articles/series.json');
  const pages = renderPages(series);
  assert.strictEqual(pages.length, 10);
  for (const p of pages){
    const expected = fs.readFileSync(path.join(series.outDir, p.out), 'utf8');
    assert.strictEqual(p.html, expected, `${p.out} 與已提交版本不符`);
  }
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `node --test test/build-golden.test.js`
Expected: FAIL —「Cannot find module '../build'」

- [ ] **Step 4: 建立 `build.js`**

把 `build-cidp.js` 的 `page(...)` 函式**逐字複製**為 `build.js` 內的 `renderPage`，僅做以下參數化改動（其餘 HTML 樣板一字不改，以確保黃金測試逐位元組相符）：
- 將檔頭常數 `SERIES_TAG` 改為讀 `series.seriesTag`。
- 將樣板中 byline 字串 `施懿恩 醫師．神經內科 · 導讀整理 2026 年` 改為 `${esc(series.byline)}`（即 `escapeHtml`）。
- `navItems` 改為 `series.articles`（其 `.out`/`.nav` 欄位與原本一致）。
- 不再使用內建 `articles` 陣列與檔案讀寫迴圈；改由 `renderPages` 驅動。

`build.js` 結構：

```js
// 通用產生器：讀 series.json → 渲染頁面（+ Task 4 套用 index）
const fs = require('fs');
const path = require('path');
const { escapeHtml: esc, parseArticle } = require('./lib/md-render');

function loadSeries(jsonPath){
  const s = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return s; // srcDir/outDir 已是絕對路徑
}

function renderPage(parsed, series, activeIdx){
  const navItems = series.articles;
  const SERIES_TAG = series.seriesTag;
  const title = parsed.title;
  const contentHtml = parsed.body;
  const desc = parsed.desc;
  // ↓↓↓ 以下為自 build-cidp.js 的 page() 逐字複製（含完整 HTML 樣板），
  //     僅把 byline 文字改為 ${esc(series.byline)}、SERIES_TAG 用上方變數。
  //     回傳組好的完整 HTML 字串。
  const navHtml = navItems.map((n,i)=>
    `<a href="${n.out}" class="series-link${i===activeIdx?' active':''}">${n.nav}</a>`).join('');
  const url = `https://md.braintaiwan.com/${navItems[activeIdx].out}`;
  const d = desc || SERIES_TAG;
  return `<!DOCTYPE html>\n<html lang="zh-TW">\n<head>\n` +
    /* …（其餘樣板自 build-cidp.js page() 逐字複製，byline 用 ${esc(series.byline)}）… */
    ``;
}

function renderPages(series){
  return series.articles.map((a, idx) => {
    const src = fs.readFileSync(path.join(series.srcDir, a.md), 'utf8');
    const parsed = parseArticle(src);
    return { out: a.out, html: renderPage(parsed, series, idx) };
  });
}

function writePages(series){
  for (const p of renderPages(series)){
    fs.writeFileSync(path.join(series.outDir, p.out), p.html, 'utf8');
    console.log('寫出', p.out);
  }
}

module.exports = { loadSeries, renderPage, renderPages, writePages };

if (require.main === module){
  const series = loadSeries(process.argv[2]);
  writePages(series);
  console.log('完成');
}
```

實作時把 `renderPage` 內的 `/* … */` 換成 `build-cidp.js` `page()` 的完整樣板（逐字），黃金測試會逼出任何差異。

- [ ] **Step 5: 執行測試，逐位元組對齊**

Run: `node --test test/build-golden.test.js`
Expected: PASS（若失敗，依 assert 訊息指出的 `cidpNN.html` 比對差異修正 `renderPage` 樣板，直到 10 篇全相符）

- [ ] **Step 6: Commit**

```bash
git add build.js test/build-golden.test.js
git -C D:/claudecode/cidp-articles add series.json 2>/dev/null || git add ../cidp-articles/series.json
git commit -m "feat: 通用 build.js 渲染頁面 + cidp 黃金測試"
```
（註：`series.json` 位於 `cidp-articles` 目錄，不在 braintaiwan-md repo 內；若不在同一 git repo，改為手動保存，不納入本 commit。）

---

### Task 3: `lib/apply-index.js` — 選色／建區塊／結構驗證／套用

**Files:**
- Create: `lib/apply-index.js`
- Create: `test/apply-index.test.js`
- Create: `test/fixtures/index-min.html`

**Interfaces:**
- Produces:
  - `PALETTE: string[]`（`['amber','blue','coral','green','indigo','purple','red','teal']`）
  - `pickColor(indexHtml: string, requested: string) -> string`（`requested !== 'auto'` 時原樣回傳）
  - `buildSectionHtml(series, color: string) -> string`（單一 `<details class="topic">…</details>`）
  - `validateDetailsBalance(indexHtml: string) -> { balanced: boolean, open: number, close: number }`
  - `applySection(indexHtml: string, series) -> string`（插入/替換標記區塊、套色、補 meta、驗證；不平衡則 throw）

- [ ] **Step 1: 建立測試夾具 `test/fixtures/index-min.html`**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta name="description" content="既有描述：中風、癲癇。">
</head>
<body>
<main>
  <details class="topic">
    <summary class="topic-head"><span class="topic-dot d-blue"></span></summary>
    <div class="topic-body"></div>
  </details>
</main>
</body>
</html>
```

- [ ] **Step 2: 寫失敗測試 `test/apply-index.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { pickColor, buildSectionHtml, validateDetailsBalance, applySection, PALETTE } = require('../lib/apply-index');

const fixture = fs.readFileSync(__dirname + '/fixtures/index-min.html', 'utf8');
const series = {
  prefix: 'demo',
  byline: 'X',
  section: { labelZh: '示範', labelEn: 'Demo', count: '2 篇', color: 'auto',
             divider: '來源線', sourceNote: '來源。', metaKeyword: '示範（DEMO）' },
  articles: [
    { out: 'demo01.html', nav: '① 一', card: { cat: '導讀 ①', title: 'T1', desc: 'D1', tags: ['a','b'] } },
    { out: 'demo02.html', nav: '② 二', card: { cat: '導讀 ②', title: 'T2', desc: 'D2', tags: ['c','d'] } }
  ]
};

test('pickColor returns requested when not auto', () => {
  assert.strictEqual(pickColor(fixture, 'red'), 'red');
});

test('pickColor auto avoids already-used colors', () => {
  const c = pickColor(fixture, 'auto'); // fixture 用了 d-blue
  assert.ok(PALETTE.includes(c));
  assert.notStrictEqual(c, 'blue');
});

test('validateDetailsBalance detects balance and imbalance', () => {
  assert.strictEqual(validateDetailsBalance(fixture).balanced, true);
  assert.strictEqual(validateDetailsBalance('<details class="topic"><summary>x</summary>').balanced, false);
});

test('applySection inserts a marked section before </main> with meta keyword', () => {
  const out = applySection(fixture, series);
  assert.match(out, /<!-- SERIES:demo START -->/);
  assert.match(out, /<!-- SERIES:demo END -->/);
  assert.match(out, /示範（DEMO）/); // meta 已補
  assert.strictEqual(validateDetailsBalance(out).balanced, true);
});

test('applySection is idempotent (run twice → identical)', () => {
  const once = applySection(fixture, series);
  const twice = applySection(once, series);
  assert.strictEqual(twice, once);
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `node --test test/apply-index.test.js`
Expected: FAIL —「Cannot find module '../lib/apply-index'」

- [ ] **Step 4: 建立 `lib/apply-index.js`**

```js
const PALETTE = ['amber','blue','coral','green','indigo','purple','red','teal'];

function pickColor(indexHtml, requested){
  if (requested && requested !== 'auto') return requested;
  const counts = PALETTE.map(c => ({
    c, n: (indexHtml.match(new RegExp(`\\bd-${c}\\b`, 'g')) || []).length
  }));
  const unused = counts.find(x => x.n === 0);
  if (unused) return unused.c;
  return counts.sort((a,b) => a.n - b.n)[0].c; // 全用過→取最少
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildSectionHtml(series, color){
  const s = series.section;
  const cards = series.articles.map(a => {
    const tags = a.card.tags;
    return `        <a href="${a.out}" class="card">
          <div class="card-banner b-${color}"></div>
          <div class="card-body">
            <div class="card-cat">${esc(a.card.cat)}</div>
            <div class="card-title">${esc(a.card.title)}</div>
            <div class="card-desc">${esc(a.card.desc)}</div>
            <div class="card-foot">
              <div><span class="tag tag-${color}">${esc(tags[0])}</span><span class="tag tag-blue">${esc(tags[1])}</span></div>
              <span class="arrow">→</span>
            </div>
          </div>
        </a>`;
  }).join('\n\n');
  return `  <details class="topic">
    <summary class="topic-head">
      <span class="chev">▸</span>
      <span class="topic-dot d-${color}"></span>
      <span class="topic-label">${esc(s.labelZh)} <span class="topic-en">${esc(s.labelEn)}</span></span>
      <span class="topic-count">${esc(s.count)}</span>
    </summary>
    <div class="topic-body">

      <div style="display:flex;align-items:center;gap:12px;margin:4px 0 18px;">
        <span style="font-size:10.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#546e7a;white-space:nowrap;">${esc(s.divider)}</span>
        <div style="flex:1;height:1px;background:#e0ece4;"></div>
      </div>

      <div class="card-grid">

${cards}

      </div>

      <div class="guideline-note">
        <strong>資料來源</strong>：${s.sourceNote}
        <br><br>
        本系列為臨床指引導讀整理，供醫療專業人員教學參考，臨床決策請依個案評估。
      </div>

    </div>
  </details>`;
}

function validateDetailsBalance(indexHtml){
  const open = (indexHtml.match(/<details class="topic">/g) || []).length;
  const close = (indexHtml.match(/<\/details>/g) || []).length;
  return { balanced: open === close, open, close };
}

function applySection(indexHtml, series){
  const color = pickColor(indexHtml, series.section.color);
  const section = buildSectionHtml(series, color);
  const startMark = `<!-- SERIES:${series.prefix} START -->`;
  const endMark = `<!-- SERIES:${series.prefix} END -->`;
  const block = `  ${startMark}\n${section}\n  ${endMark}`;

  let out;
  const startIdx = indexHtml.indexOf(startMark);
  if (startIdx !== -1){
    const endIdx = indexHtml.indexOf(endMark);
    if (endIdx === -1) throw new Error(`找到 ${startMark} 但缺 ${endMark}`);
    const before = indexHtml.slice(0, indexHtml.lastIndexOf('  ', startIdx));
    const after = indexHtml.slice(endIdx + endMark.length);
    out = before + block + after;
  } else {
    const mainClose = indexHtml.lastIndexOf('</main>');
    if (mainClose === -1) throw new Error('找不到 </main>');
    out = indexHtml.slice(0, mainClose) + block + '\n\n' + indexHtml.slice(mainClose);
  }

  // 補 meta keyword
  const kw = series.section.metaKeyword;
  if (kw && !out.includes(kw)){
    out = out.replace(/(<meta name="description" content="[^"]*?)("\s*>)/,
      (m, head, tail) => head.replace(/。$/, '') + `、${kw}。` + tail);
  }

  const bal = validateDetailsBalance(out);
  if (!bal.balanced) throw new Error(`details 不平衡 open=${bal.open} close=${bal.close}`);
  return out;
}

module.exports = { PALETTE, pickColor, buildSectionHtml, validateDetailsBalance, applySection };
```

- [ ] **Step 5: 執行測試確認通過**

Run: `node --test test/apply-index.test.js`
Expected: PASS（5 tests）

- [ ] **Step 6: Commit**

```bash
git add lib/apply-index.js test/apply-index.test.js test/fixtures/index-min.html
git commit -m "feat: lib/apply-index.js（選色/建區塊/結構驗證/冪等套用）"
```

---

### Task 4: `build.js` CLI 整合 apply-index + 整合測試

**Files:**
- Modify: `build.js`（在 `writePages` 後呼叫 `applySection` 寫回 index.html）
- Create: `test/build-integration.test.js`

**Interfaces:**
- Consumes: `applySection` from `lib/apply-index`、`writePages`/`loadSeries` from `build`
- Produces: `applyIndex(series) -> void`（讀 `outDir/index.html` → `applySection` → 寫回）

- [ ] **Step 1: 寫失敗測試 `test/build-integration.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applySection } = require('../lib/apply-index');

test('applySection on a temp index keeps balance and adds section', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-'));
  const idxPath = path.join(tmp, 'index.html');
  fs.copyFileSync(__dirname + '/fixtures/index-min.html', idxPath);
  const series = {
    prefix: 'demo', byline: 'X',
    section: { labelZh: '示範', labelEn: 'Demo', count: '1 篇', color: 'auto', divider: 'd', sourceNote: 's', metaKeyword: 'DEMO' },
    articles: [{ out: 'demo01.html', nav: '① 一', card: { cat: '導讀 ①', title: 'T', desc: 'D', tags: ['a','b'] } }]
  };
  const updated = applySection(fs.readFileSync(idxPath, 'utf8'), series);
  fs.writeFileSync(idxPath, updated, 'utf8');
  const round = fs.readFileSync(idxPath, 'utf8');
  assert.match(round, /<!-- SERIES:demo START -->/);
  assert.match(round, /T<\/div>/);
});
```

- [ ] **Step 2: 執行測試確認通過（驗證 apply 流程，library 已存在）**

Run: `node --test test/build-integration.test.js`
Expected: PASS

- [ ] **Step 3: 在 `build.js` 加入 `applyIndex` 並接到 CLI**

在 `build.js` `require` 區加入 `const { applySection } = require('./lib/apply-index');`，並新增：

```js
function applyIndex(series){
  const idxPath = path.join(series.outDir, 'index.html');
  const html = fs.readFileSync(idxPath, 'utf8');
  fs.writeFileSync(idxPath, applySection(html, series), 'utf8');
  console.log('已更新 index.html 區塊', series.prefix);
}
```

更新匯出與 CLI：

```js
module.exports = { loadSeries, renderPage, renderPages, writePages, applyIndex };

if (require.main === module){
  const series = loadSeries(process.argv[2]);
  writePages(series);
  applyIndex(series);
  console.log('完成');
}
```

- [ ] **Step 4: 執行全部測試**

Run: `node --test`
Expected: PASS（md-render 5、golden 1、apply-index 5、integration 1）

- [ ] **Step 5: Commit**

```bash
git add build.js test/build-integration.test.js
git commit -m "feat: build.js CLI 整合 apply-index 寫回 index.html"
```

---

### Task 5: 遷移現有 cidp 區塊為標記式並驗證

**Files:**
- Modify: `index.html`（將手寫 cidp 區塊改為由工具生成、含標記）

**Interfaces:**
- Consumes: `loadSeries`, `writePages`, `applyIndex` from `build`

- [ ] **Step 1: 備份目前 cidp 頁面雜湊**

Run: `git rev-parse HEAD && md5sum cidp01.html cidp10.html`
Expected: 記下雜湊備查（此步只記錄）

- [ ] **Step 2: 手動移除 index.html 既有手寫 cidp 區塊**

刪除 `<!-- 周邊神經 / CIDP -->` 起至其 `</details>` 止的整段（目前無標記的手寫版），保留前後內容；存檔。

- [ ] **Step 3: 以新工具重建 cidp（頁面 + 標記式 index 區塊）**

Run: `node build.js D:/claudecode/cidp-articles/series.json`
Expected: console 印出 10 個 `寫出 cidpNN.html` 與「已更新 index.html 區塊 cidp」

- [ ] **Step 4: 驗證頁面未變、index 平衡、區塊有標記**

Run: `git diff --stat cidp01.html cidp10.html && node -e "const{validateDetailsBalance}=require('./lib/apply-index');const fs=require('fs');console.log(validateDetailsBalance(fs.readFileSync('index.html','utf8')))"`
Expected: `cidp01.html`/`cidp10.html` **無 diff**（黃金保真）；balance `{ balanced: true }`；`grep -c "SERIES:cidp" index.html` 應為 2

- [ ] **Step 5: 執行全部測試**

Run: `node --test`
Expected: PASS（全綠）

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "refactor: cidp index 區塊改為 build.js 生成（標記式、可重建）"
```

---

## 範圍邊界（本計畫不含）

Phase 2（`md-series` skill、Workflow 多代理起草、claim-ledger 驗證閘門、自動 commit/push、`--dry-run`/`--no-gate`）為獨立子系統，俟 Phase 1 之 `build.js`/`apply-index.js` 介面落地為實碼後，另開一份計畫。Phase 2 的 Assemble 階段將直接呼叫本計畫產出的 `writePages` 與 `applyIndex`。
