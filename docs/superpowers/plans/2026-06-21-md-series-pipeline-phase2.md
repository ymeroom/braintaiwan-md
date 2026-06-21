# MD 產線 Phase 2（全自動產線）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一個指令（`/md-series`）讀來源 PDF → 多代理並行起草 N 篇導讀 → claim-ledger 驗證閘門 → 通過才 build＋commit＋push，失敗則中止並寫報告。

**Architecture:** Workflow 沙箱**無 fs/git 存取**，故只負責 LLM 並行＋判斷，回傳結構化資料（series 骨架、draft markdown、claim ledgers）。決定論的閘門評估、報告、寫檔、`build.js`、git 由**主會話**在 Workflow 回傳後執行（由 `md-series` skill 編排）。閘門/報告/schema 驗證為純函式，獨立 TDD；Workflow 腳本與 skill 為整合層，以決定論閘門測試＋ dry-run 煙霧測試驗證。

**Tech Stack:** Node.js 24（CommonJS）、內建 `node:test`、Workflow 工具（`agent`/`pipeline`/`parallel`、JSON-Schema 結構化輸出）、Phase 1 的 `build.js`/`lib/apply-index.js`。

## Global Constraints

- Node.js 24，CommonJS，無外部套件；測試 `node:test`，`node --test`。
- 不修改既有 22 支 `build-*.js`。UTF-8、LF。
- Workflow 腳本**不得**呼叫 fs/Node API/git（沙箱限制）——寫檔、build、git 一律在主會話做。
- 來源 PDF 由 agent 直接用 Read 工具讀（Read 支援 PDF）；Verify agent 重讀對應 PDF 溯源。
- 高風險 claim 類別固定為：`dose, percent, cutoff, criterion`。
- claim `classification` 三態固定：`SUPPORTED, NOT_FOUND, CONTRADICTED`。
- claim `claimType` 列舉固定：`dose, percent, cutoff, criterion, epidemiology, drugName, other`。
- 系列原子性：任一篇觸發阻擋 → 整個系列不 push。
- `--no-gate` 預設關閉；使用時 `pass=true` 但 `unverified=true`，報告與 commit 訊息標記「⚠ 未經驗證」。
- 驗證報告路徑：`<srcDir>/_verification-report.md`。
- Phase 1 可呼叫介面：`build.js` 匯出 `loadSeries/renderPage/renderPages/writePages/applyIndex`；`lib/apply-index.js` 匯出 `PALETTE/pickColor/buildSectionHtml/validateDetailsBalance/applySection`。

---

## 檔案結構

| 檔案 | 職責 | 類型 |
|------|------|------|
| `lib/series-schema.js` | `assertSeriesShape(series)` 邊界驗證 | 純函式（TDD） |
| `lib/apply-index.js` | 收緊 `pickColor` 只數 `topic-dot d-*` | 修改（TDD） |
| `lib/gate.js` | `evaluateGate(ledgers, opts)` 閘門決策 | 純函式（TDD） |
| `lib/report.js` | `renderReport(ledgers, gateResult)` 報告 | 純函式（TDD） |
| `.claude/workflows/md-series-pipeline.js` | Plan→Draft→Verify 編排，回傳資料 | 整合（Workflow 腳本） |
| `.claude/skills/md-series/SKILL.md` | 觸發、參數、主會話 assemble/publish 編排 | 整合（skill 指令） |

---

### Task 1: `lib/series-schema.js` 邊界驗證 + 接入 `loadSeries`

**Files:**
- Create: `lib/series-schema.js`
- Modify: `build.js`（`loadSeries` 內呼叫 `assertSeriesShape`）
- Create: `test/series-schema.test.js`

**Interfaces:**
- Produces: `assertSeriesShape(series) -> series`（驗證通過回傳原物件；失敗 throw `Error`，訊息含缺失欄位路徑）
- Consumes: 既有 `loadSeries` from `build.js`

- [ ] **Step 1: 寫失敗測試 `test/series-schema.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { assertSeriesShape } = require('../lib/series-schema');

function valid(){
  return {
    prefix: 'demo', seriesTag: 'T', srcDir: '/s', outDir: '/o', byline: 'B',
    section: { labelZh: 'z', labelEn: 'e', count: 'c', color: 'auto', divider: 'd', sourceNote: 's', metaKeyword: 'k' },
    articles: [{ md: '01.md', out: 'demo01.html', nav: '① 一', card: { cat: '導讀 ①', title: 't', desc: 'd', tags: ['a','b'] } }]
  };
}

test('valid series passes and returns itself', () => {
  const s = valid();
  assert.strictEqual(assertSeriesShape(s), s);
});

test('missing top-level field throws naming the field', () => {
  const s = valid(); delete s.seriesTag;
  assert.throws(() => assertSeriesShape(s), /seriesTag/);
});

test('empty articles array throws', () => {
  const s = valid(); s.articles = [];
  assert.throws(() => assertSeriesShape(s), /articles/);
});

test('article missing card.tags pair throws naming the article', () => {
  const s = valid(); s.articles[0].card.tags = ['only-one'];
  assert.throws(() => assertSeriesShape(s), /tags/);
});

test('section missing color throws', () => {
  const s = valid(); delete s.section.color;
  assert.throws(() => assertSeriesShape(s), /section\.color/);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test test/series-schema.test.js`
Expected: FAIL —「Cannot find module '../lib/series-schema'」

- [ ] **Step 3: 建立 `lib/series-schema.js`**

```js
// series.json 結構驗證（純函式，給 loadSeries 在邊界用）
function req(obj, path, cond){
  if (!cond) throw new Error(`series.json 無效：${path}`);
}

function assertSeriesShape(s){
  req(s, 'series', s && typeof s === 'object');
  for (const k of ['prefix','seriesTag','srcDir','outDir','byline']){
    req(s, k, typeof s[k] === 'string' && s[k].length > 0);
  }
  const sec = s.section;
  req(s, 'section', sec && typeof sec === 'object');
  for (const k of ['labelZh','labelEn','count','color','divider','sourceNote','metaKeyword']){
    req(s, `section.${k}`, typeof sec[k] === 'string' && sec[k].length > 0);
  }
  req(s, 'articles', Array.isArray(s.articles) && s.articles.length > 0);
  s.articles.forEach((a, i) => {
    for (const k of ['md','out','nav']){
      req(s, `articles[${i}].${k}`, typeof a[k] === 'string' && a[k].length > 0);
    }
    const c = a.card;
    req(s, `articles[${i}].card`, c && typeof c === 'object');
    for (const k of ['cat','title','desc']){
      req(s, `articles[${i}].card.${k}`, typeof c[k] === 'string' && c[k].length > 0);
    }
    req(s, `articles[${i}].card.tags`, Array.isArray(c.tags) && c.tags.length === 2
      && c.tags.every(t => typeof t === 'string' && t.length > 0));
  });
  return s;
}

module.exports = { assertSeriesShape };
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test test/series-schema.test.js`
Expected: PASS（5 tests）

- [ ] **Step 5: 接入 `build.js` `loadSeries`**

在 `build.js` `require` 區加入 `const { assertSeriesShape } = require('./lib/series-schema');`，並在 `loadSeries` 的 `JSON.parse` 之後、`return` 之前插入 `assertSeriesShape(s);`：

```js
function loadSeries(jsonPath){
  const s = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assertSeriesShape(s);
  return s;
}
```

- [ ] **Step 6: 跑全套確認 cidp 黃金測試仍綠（series.json 合法應通過驗證）**

Run: `node --test`
Expected: PASS（14 既有 + 5 新 = 19；golden 仍綠）

- [ ] **Step 7: Commit**

```bash
git add lib/series-schema.js build.js test/series-schema.test.js
git commit -m "feat: series.json 結構驗證 assertSeriesShape + 接入 loadSeries"
```

---

### Task 2: 收緊 `pickColor` 只數 `topic-dot d-*`

**Files:**
- Modify: `lib/apply-index.js`（`pickColor` 計數正則）
- Modify: `test/apply-index.test.js`（新增飽和盤 + CSS 不計入測試）

**Interfaces:**
- Consumes/Produces: 既有 `pickColor(indexHtml, requested)`（行為不變，僅計數來源收緊）

- [ ] **Step 1: 寫失敗測試（加到 `test/apply-index.test.js` 末端）**

```js
test('pickColor counts only topic-dot usages, not CSS definitions', () => {
  // 含 8 色的 CSS 定義，但只有 green 真的被 topic-dot 使用
  const css = '.d-amber{}.d-blue{}.d-coral{}.d-green{}.d-indigo{}.d-purple{}.d-red{}.d-teal{}';
  const html = `<style>${css}</style><span class="topic-dot d-green"></span>`;
  const c = pickColor(html, 'auto');
  assert.notStrictEqual(c, 'green');           // green 已被 topic-dot 使用
  assert.ok(PALETTE.includes(c));
});

test('pickColor falls back to least-used when palette saturated', () => {
  // 每色都被 topic-dot 用一次，再讓 red 多用一次 → 不應回傳 red
  const dots = PALETTE.map(c => `<span class="topic-dot d-${c}"></span>`).join('')
    + '<span class="topic-dot d-red"></span>';
  const c = pickColor(dots, 'auto');
  assert.notStrictEqual(c, 'red');
});
```

- [ ] **Step 2: 執行確認新測試失敗**

Run: `node --test test/apply-index.test.js`
Expected: FAIL —「pickColor counts only topic-dot usages」（舊正則把 CSS 的 `.d-green` 也算，但 green 又被 topic-dot 用，結果其實仍會避開 green；真正會失敗的是飽和盤案例與 CSS 案例的計數語意）。若第一個測試未失敗，仍續行修正以符合語意。

- [ ] **Step 3: 修改 `pickColor` 計數正則**

在 `lib/apply-index.js` 的 `pickColor` 內，把計數正則由 `\\bd-${c}\\b` 改為只數 topic-dot：

```js
function pickColor(indexHtml, requested){
  if (requested && requested !== 'auto') return requested;
  const counts = PALETTE.map(c => ({
    c, n: (indexHtml.match(new RegExp(`topic-dot d-${c}\\b`, 'g')) || []).length
  }));
  const unused = counts.find(x => x.n === 0);
  if (unused) return unused.c;
  return counts.sort((a,b) => a.n - b.n)[0].c;
}
```

- [ ] **Step 4: 執行全套確認通過**

Run: `node --test`
Expected: PASS（含新 2 測試；既有 apply-index 與 cidp golden 仍綠——fixture 用 `topic-dot d-blue`，新正則仍計入）

- [ ] **Step 5: Commit**

```bash
git add lib/apply-index.js test/apply-index.test.js
git commit -m "fix: pickColor 只計 topic-dot d-* 使用，排除 CSS 定義"
```

---

### Task 3: `lib/gate.js` 驗證閘門決策

**Files:**
- Create: `lib/gate.js`
- Create: `test/gate.test.js`

**Interfaces:**
- Produces:
  - `HIGH_RISK: string[]`（`['dose','percent','cutoff','criterion']`）
  - `evaluateGate(ledgers, opts) -> { pass: boolean, unverified: boolean, blockers: Array<{article,sentence,claimType,classification,reason}> }`
  - `ledgers` 形狀：`Array<{ article: string, claims: Array<{ sentence, claimType, value, classification, sourceQuote }> }>`
  - `opts`：`{ noGate?: boolean }`

- [ ] **Step 1: 寫失敗測試 `test/gate.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluateGate, HIGH_RISK } = require('../lib/gate');

const claim = (over) => ({ sentence: 's', claimType: 'other', value: 'v', classification: 'SUPPORTED', sourceQuote: 'q', ...over });
const ledger = (article, claims) => ({ article, claims });

test('all supported → pass, not unverified, no blockers', () => {
  const r = evaluateGate([ledger('a', [claim(), claim()])], {});
  assert.deepStrictEqual(r, { pass: true, unverified: false, blockers: [] });
});

test('any CONTRADICTED → blocked', () => {
  const r = evaluateGate([ledger('a', [claim({ classification: 'CONTRADICTED' })])], {});
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.blockers.length, 1);
  assert.strictEqual(r.blockers[0].article, 'a');
});

test('high-risk NOT_FOUND → blocked', () => {
  const r = evaluateGate([ledger('a', [claim({ claimType: 'cutoff', classification: 'NOT_FOUND' })])], {});
  assert.strictEqual(r.pass, false);
});

test('low-risk NOT_FOUND → not blocked', () => {
  const r = evaluateGate([ledger('a', [claim({ claimType: 'other', classification: 'NOT_FOUND' })])], {});
  assert.strictEqual(r.pass, true);
});

test('atomicity: one bad article among many → whole series fails', () => {
  const r = evaluateGate([
    ledger('a', [claim()]),
    ledger('b', [claim({ classification: 'CONTRADICTED' })]),
    ledger('c', [claim()]),
  ], {});
  assert.strictEqual(r.pass, false);
});

test('noGate → pass true but unverified, blockers still computed', () => {
  const r = evaluateGate([ledger('a', [claim({ classification: 'CONTRADICTED' })])], { noGate: true });
  assert.strictEqual(r.pass, true);
  assert.strictEqual(r.unverified, true);
  assert.strictEqual(r.blockers.length, 1); // 仍記錄，供報告標示
});

test('HIGH_RISK is the four categories', () => {
  assert.deepStrictEqual([...HIGH_RISK].sort(), ['criterion','cutoff','dose','percent']);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test test/gate.test.js`
Expected: FAIL —「Cannot find module '../lib/gate'」

- [ ] **Step 3: 建立 `lib/gate.js`**

```js
// 驗證閘門決策（純函式）
const HIGH_RISK = ['dose', 'percent', 'cutoff', 'criterion'];

function evaluateGate(ledgers, opts){
  const noGate = !!(opts && opts.noGate);
  const blockers = [];
  for (const lg of ledgers){
    for (const c of lg.claims){
      if (c.classification === 'CONTRADICTED'){
        blockers.push({ article: lg.article, sentence: c.sentence, claimType: c.claimType,
          classification: c.classification, reason: '與源文矛盾' });
      } else if (c.classification === 'NOT_FOUND' && HIGH_RISK.includes(c.claimType)){
        blockers.push({ article: lg.article, sentence: c.sentence, claimType: c.claimType,
          classification: c.classification, reason: `高風險類別(${c.claimType})未在源文找到` });
      }
    }
  }
  const pass = noGate ? true : blockers.length === 0;
  return { pass, unverified: noGate, blockers };
}

module.exports = { HIGH_RISK, evaluateGate };
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test test/gate.test.js`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/gate.js test/gate.test.js
git commit -m "feat: lib/gate.js 驗證閘門決策（CONTRADICTED/高風險NOT_FOUND/原子性/no-gate）"
```

---

### Task 4: `lib/report.js` 驗證報告

**Files:**
- Create: `lib/report.js`
- Create: `test/report.test.js`

**Interfaces:**
- Consumes: `gateResult` from `lib/gate.js`（`{ pass, unverified, blockers }`）、`ledgers`（同 Task 3 形狀）
- Produces: `renderReport(ledgers, gateResult) -> string`（markdown）

- [ ] **Step 1: 寫失敗測試 `test/report.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderReport } = require('../lib/report');

const ledgers = [
  { article: 'a01.html', claims: [
    { sentence: 'IVIg 2 g/kg', claimType: 'dose', value: '2 g/kg', classification: 'SUPPORTED', sourceQuote: 'loading dose 2.0 g/kg' },
    { sentence: '亂寫的數字', claimType: 'cutoff', value: '9.9 mV', classification: 'CONTRADICTED', sourceQuote: '1.0 mV' },
  ]},
];

test('blocked report leads with verdict and lists blockers first', () => {
  const md = renderReport(ledgers, { pass: false, unverified: false, blockers: [
    { article: 'a01.html', sentence: '亂寫的數字', claimType: 'cutoff', classification: 'CONTRADICTED', reason: '與源文矛盾' }
  ]});
  assert.match(md, /BLOCKED/);
  const blockerIdx = md.indexOf('亂寫的數字');
  const perArticleIdx = md.indexOf('a01.html');
  assert.ok(blockerIdx !== -1 && perArticleIdx !== -1);
  assert.match(md, /與源文矛盾/);
});

test('passed report says PASS and still includes per-article tables', () => {
  const md = renderReport(ledgers, { pass: true, unverified: false, blockers: [] });
  assert.match(md, /PASS/);
  assert.match(md, /a01\.html/);
  assert.match(md, /IVIg 2 g\/kg/);
});

test('unverified report is marked', () => {
  const md = renderReport(ledgers, { pass: true, unverified: true, blockers: [] });
  assert.match(md, /未經驗證/);
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `node --test test/report.test.js`
Expected: FAIL —「Cannot find module '../lib/report'」

- [ ] **Step 3: 建立 `lib/report.js`**

```js
// 驗證報告 markdown（純函式）
function esc(s){ return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }

function verdictLine(gateResult){
  if (gateResult.unverified) return '# 驗證報告：⚠ 未經驗證（--no-gate）';
  return gateResult.pass ? '# 驗證報告：✅ PASS' : '# 驗證報告：⛔ BLOCKED';
}

function blockersSection(blockers){
  if (!blockers.length) return '';
  let s = '\n## ⛔ 阻擋項\n\n| 篇 | 句子 | 類別 | 判定 | 原因 |\n|----|------|------|------|------|\n';
  for (const b of blockers){
    s += `| ${esc(b.article)} | ${esc(b.sentence)} | ${esc(b.claimType)} | ${esc(b.classification)} | ${esc(b.reason)} |\n`;
  }
  return s;
}

function articleTable(lg){
  let s = `\n## ${esc(lg.article)}\n\n| 句子 | 類別 | 判定 | 源文佐證 |\n|------|------|------|----------|\n`;
  for (const c of lg.claims){
    s += `| ${esc(c.sentence)} | ${esc(c.claimType)} | ${esc(c.classification)} | ${esc(c.sourceQuote)} |\n`;
  }
  return s;
}

function renderReport(ledgers, gateResult){
  let out = verdictLine(gateResult) + '\n';
  out += blockersSection(gateResult.blockers || []);
  for (const lg of ledgers){ out += articleTable(lg); }
  return out;
}

module.exports = { renderReport };
```

- [ ] **Step 4: 執行確認通過**

Run: `node --test test/report.test.js`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/report.js test/report.test.js
git commit -m "feat: lib/report.js 驗證報告 markdown（阻擋項置頂+每篇表）"
```

---

### Task 5: Workflow 編排腳本 + claim-ledger schema

**Files:**
- Create: `.claude/workflows/md-series-pipeline.js`

**Interfaces:**
- Produces（Workflow 回傳值，供主會話消費）：
  `{ series: <series.json物件>, drafts: Array<{ md: string, content: string }>, ledgers: Array<{ article, claims[] }> }`
- 約束：腳本只用 `agent/pipeline/parallel/phase/log/args`，**不碰 fs/git**。

- [ ] **Step 1: 建立 `.claude/workflows/md-series-pipeline.js`**

```js
export const meta = {
  name: 'md-series-pipeline',
  description: '讀來源產出 N 篇 BrainTaiwan MD 導讀草稿並逐篇做 claim-ledger 驗證',
  phases: [
    { title: 'Plan', detail: '規劃 N 篇與來源對應' },
    { title: 'Draft', detail: '每篇一個 agent 起草' },
    { title: 'Verify', detail: '每篇一個 agent 建 claim ledger' },
  ],
};

const LEDGER_SCHEMA = {
  type: 'object',
  required: ['article', 'claims'],
  properties: {
    article: { type: 'string' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sentence', 'claimType', 'value', 'classification', 'sourceQuote'],
        properties: {
          sentence: { type: 'string' },
          claimType: { type: 'string', enum: ['dose','percent','cutoff','criterion','epidemiology','drugName','other'] },
          value: { type: 'string' },
          classification: { type: 'string', enum: ['SUPPORTED','NOT_FOUND','CONTRADICTED'] },
          sourceQuote: { type: 'string' },
        },
      },
    },
  },
};

const PLAN_SCHEMA = {
  type: 'object',
  required: ['series', 'briefs'],
  properties: {
    series: { type: 'object' },           // series.json 骨架（prefix/section/articles…）
    briefs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['md', 'out', 'nav', 'sourceFocus'],
        properties: {
          md: { type: 'string' }, out: { type: 'string' }, nav: { type: 'string' },
          sourceFocus: { type: 'string' },  // 本篇要涵蓋的來源段落/重點
        },
      },
    },
  },
};

const { srcPaths, topic, n, prefix } = args;
const srcList = srcPaths.join(', ');

phase('Plan');
const plan = await agent(
  `你在規劃一個 BrainTaiwan MD 臨床導讀系列。主題：「${topic}」，共 ${n} 篇，檔名前綴 ${prefix}。` +
  `請用 Read 工具讀這些來源 PDF：${srcList}。` +
  `產出 series.json 骨架（prefix、seriesTag、section{labelZh,labelEn,count,color:"auto",divider,sourceNote,metaKeyword}、` +
  `articles[]，每篇含 md/out/nav/card{cat,title,desc,tags(剛好2個)}），以及每篇 brief（md/out/nav/sourceFocus）。` +
  `風格遵守 BrainTaiwan 寫作規則：費曼語氣、不寫前言、不呼籲行動、避免 AI 塑膠詞。`,
  { schema: PLAN_SCHEMA, label: 'plan' }
);

phase('Draft');
const drafted = (await parallel(plan.briefs.map(brief => () =>
  agent(
    `撰寫第「${brief.nav}」篇 markdown（檔名 ${brief.md}）。系列主題：${topic}。本篇重點：${brief.sourceFocus}。` +
    `用 Read 工具讀來源 PDF（${srcList}）取材。只輸出 markdown 全文，不要任何說明或前後綴。` +
    `嚴格遵守 BrainTaiwan 寫作規則：費曼咖啡廳語氣、第一句直接切入核心、不寫前言開場白、不用條列開場、` +
    `結尾停在一個觀察或未解問題、不呼籲讀者行動、避免禁用詞；保留 frontmatter＋臨床要點摘要表＋🩺 施懿恩小評論＋免責聲明。`,
    { label: `draft:${brief.out}`, phase: 'Draft' }
  ).then(content => ({ md: brief.md, out: brief.out, nav: brief.nav, content }))
))).filter(Boolean);

phase('Verify');
const ledgers = (await parallel(drafted.map(d => () =>
  agent(
    `你是嚴格的查核者。用 Read 工具重讀來源 PDF（${srcList}）逐條查核下面這篇草稿。` +
    `把每一個可查核斷言（數字、劑量、百分比、切點、診斷準則、藥名、流病數據）抽成一條 claim：` +
    `classification 標 SUPPORTED（源文支持，附 sourceQuote）／NOT_FOUND（源文找不到）／CONTRADICTED（與源文矛盾，附 sourceQuote）；` +
    `claimType 從列舉選；value 填斷言中的數值或關鍵詞。寧可多抽，不要漏掉任何數字。草稿全文：\n\n${d.content}`,
    { label: `verify:${d.out}`, phase: 'Verify', schema: LEDGER_SCHEMA }
  ).then(lg => ({ ...lg, article: d.out }))
))).filter(Boolean);

return {
  series: plan.series,
  drafts: drafted.map(d => ({ md: d.md, content: d.content })),
  ledgers,
};
```

- [ ] **Step 2: 語法檢查（ESM）**

Run: `node --input-type=module --check < .claude/workflows/md-series-pipeline.js`
Expected: 無輸出（語法正確）。若報 `args`/`agent` 未定義——那是執行期由 Workflow 提供的全域，`--check` 只驗語法不執行，故不應報未定義；若報 `export` 相關錯誤，確認用 `--input-type=module`。

- [ ] **Step 3: 結構自檢（meta 與回傳鍵）**

人工確認：`meta.name === 'md-series-pipeline'`、`meta.phases` 三項（Plan/Draft/Verify）、最終 `return` 物件含 `series`/`drafts`/`ledgers` 三鍵、腳本內**無** `require`/`fs`/`process`/`git` 字樣。

- [ ] **Step 4: Commit**

```bash
git add .claude/workflows/md-series-pipeline.js
git commit -m "feat: md-series-pipeline Workflow 腳本（Plan→Draft→Verify，claim-ledger schema）"
```

---

### Task 6: `md-series` skill + 主會話 assemble/publish 編排

**Files:**
- Create: `.claude/skills/md-series/SKILL.md`

**Interfaces:**
- Consumes: Workflow `md-series-pipeline` 回傳的 `{series,drafts,ledgers}`；`lib/gate.js` `evaluateGate`；`lib/report.js` `renderReport`；`build.js`（`node build.js <series.json>`）；`lib/series-schema.js` 經 `loadSeries` 間接使用。

- [ ] **Step 1: 建立 `.claude/skills/md-series/SKILL.md`**

```markdown
---
name: md-series
description: 全自動產生一個 BrainTaiwan MD 臨床導讀系列——讀來源 PDF、多代理起草、claim-ledger 驗證閘門、通過才 build+commit+push。觸發：使用者輸入 /md-series 或要求「自動做一個 X 系列」。
---

# md-series：全自動臨床導讀產線

## 參數
`/md-series --src <pdf...> --topic "<主題>" --n <篇數> [--dry-run] [--no-gate] [--prefix <前綴>]`
- `--src`：一或多個來源 PDF 絕對路徑（必填）
- `--topic`、`--n`：主題與篇數（必填）
- `--prefix`：檔名前綴（未給則由主題推一個短英文前綴，與既有系列不衝突）
- `--dry-run`：跑到 build 為止，**不 commit/不 push**
- `--no-gate`：跳過驗證閘門（報告與 commit 訊息標記「⚠ 未經驗證」）

## 流程（嚴格依序）

1. 解析參數；決定 `srcDir`（建議 `D:/claudecode/<prefix>-articles/`）。確認來源 PDF 存在。

2. 呼叫 Workflow：
   `Workflow({ name: 'md-series-pipeline', args: { srcPaths, topic, n, prefix } })`
   等待回傳 `{ series, drafts, ledgers }`。

3. 閘門評估（決定論，主會話）：
   - `const { evaluateGate } = require('<repo>/lib/gate')`（用 Bash `node -e` 或直接在會話以 node 執行）
   - `const gate = evaluateGate(ledgers, { noGate: <--no-gate> })`

4. 寫報告：`const md = require('<repo>/lib/report').renderReport(ledgers, gate)` → 寫到 `<srcDir>/_verification-report.md`。

5. **閘門判定**：
   - 若 `gate.pass === false`（且非 --no-gate）：**停**。不寫草稿正文、不 build、不 commit/push。回報阻擋摘要 + 報告路徑。結束。
   - 若 `gate.pass === true`：續。

6. 寫檔：把 `drafts` 各篇 `content` 寫到 `<srcDir>/<md>`；把 `series`（已含 srcDir/outDir/byline 等；若缺由 skill 補齊）寫到 `<srcDir>/series.json`。

7. Build：`node build.js <srcDir>/series.json`（會渲染頁面 + 套用 index 區塊；`loadSeries` 內 `assertSeriesShape` 會擋掉壞 series.json）。確認 0 退出碼。

8. 結構驗證：`node -e "const{validateDetailsBalance}=require('./lib/apply-index');const fs=require('fs');const r=validateDetailsBalance(fs.readFileSync('index.html','utf8'));if(!r.balanced)process.exit(1)"`。不平衡 → 停、不 push、回報。

9. 發佈（除非 --dry-run）：
   - commit 訊息：`新增 <topic> 臨床導讀 <n> 篇（<prefix>）`；--no-gate 時前綴 `⚠ 未經驗證：`。
   - `git add <out 頁面> index.html`（series.json 與草稿在 srcDir，視是否同 repo 決定是否納入）→ `git commit` → `git push origin main`。
   - --dry-run：到第 8 步為止，回報「已 build、未 push」。

## 失敗行為
任何一步失敗（閘門未過、build 非 0、結構不平衡、push 失敗）→ **不繼續 push**，保留草稿與 `_verification-report.md`，回報具體失敗點。

## 醫療安全但書
驗證閘門只查「數字是否與源文相符」，無法判斷語境正確性。即使通過也產出報告供抽查。`--no-gate` 僅在明確知情時使用。
```

- [ ] **Step 2: 驗證 skill frontmatter 可被載入**

Run: `node -e "const fs=require('fs');const t=fs.readFileSync('.claude/skills/md-series/SKILL.md','utf8');if(!/^---[\s\S]*?name: md-series[\s\S]*?---/.test(t))process.exit(1);console.log('frontmatter ok')"`
Expected: `frontmatter ok`

- [ ] **Step 3: 注入錯誤閘門測試（決定論，確認會擋）**

此步以 `lib/gate.js` 直接驗證「含 CONTRADICTED 的 ledger 會擋」，不需跑 LLM：

Run:
```bash
node -e "const{evaluateGate}=require('./lib/gate');const r=evaluateGate([{article:'x.html',claims:[{sentence:'錯的',claimType:'cutoff',value:'9 mV',classification:'CONTRADICTED',sourceQuote:'1.0 mV'}]}],{});console.log(JSON.stringify(r));if(r.pass)process.exit(1)"
```
Expected: 印出 `{"pass":false,...}` 且退出碼 0（`r.pass` 為 false 故不觸發 `process.exit(1)`）。這證明閘門對矛盾數字會擋。

- [ ] **Step 4: 端到端 dry-run 煙霧測試（人工，記錄於 commit 訊息或報告）**

> 這步需要實際 LLM 執行，無法納入 `node --test`。實作者（或操作者）執行一次：
> `/md-series --src <一份小PDF> --topic "煙霧測試" --n 2 --dry-run`
> 預期：Workflow 回傳 2 篇 draft + 2 個 ledger；產生 `_verification-report.md`；若通過則 build 出 2 頁與 index 區塊；**不 push**。確認 `git status` 顯示未 commit。記錄觀察結果。
> 若閘門誤擋或 schema 不符，回報調整 prompt/schema。

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/md-series/SKILL.md
git commit -m "feat: md-series skill（觸發+主會話 gate/report/build/publish 編排）"
```

---

## 範圍邊界與已知限制

- Workflow 的 Plan/Draft/Verify 為 LLM 階段，無法決定論單元測試；其正確性靠 Task 3 的閘門邏輯測試（決定論）＋ Task 6 Step 4 的一次性 dry-run 煙霧測試保證。
- 驗證閘門降低、非消滅醫療正確性風險（語境錯置仍可能漏網）；故即使通過也產報告。
- `series.json`／草稿若位於來源目錄（repo 外），git commit 僅納入 repo 內的 `<prefix>NN.html` 與 `index.html`；source 檔由操作者另存。
- 自動 push 為預設；保守用法請加 `--dry-run`。
