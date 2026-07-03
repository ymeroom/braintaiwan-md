# md-series 異質多代理升級（v3）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 /md-series 產線異質化——Codex 起草、Antigravity 審查、Fable 仲裁，claim-gate 置於仲裁後，現有機械層完全不動。

**Architecture:** 新增一支純函式模組 `lib/hetero.js`（工單組裝、審查 prompt 組裝、審查輸出容錯解析），以真實 CLI 煙霧測試釘死 `codex exec` / `agy -p` 的可用呼叫型式，最後重寫 `SKILL.md` 為 v3 流程（含 preflight、降級、`--no-hetero` 退回模式）。

**Tech Stack:** Node.js CommonJS、`node --test` + `node:assert`、`codex` CLI 0.142.5、`agy` CLI 1.0.16。

**Spec:** `docs/superpowers/specs/2026-07-03-hetero-agents-design.md`

## Global Constraints

- 不動 `build.js`、`lib/gate.js`、`lib/report.js`、`lib/apply-index.js`、`.claude/workflows/md-series-pipeline.js`
- CommonJS（package.json `"type": "commonjs"`）、零新依賴、測試跑 `node --test`
- 所有 codex/agy 呼叫**必須關 stdin**（`</dev/null`，實測不關會掛住）
- 原生 `gemini` CLI 不可用（免費層停用），一律用 `agy`
- 每個 task 結尾 commit；**全程不 push**（發佈需用戶核可）
- 工作目錄：`D:\claudecode\braintaiwan-md`（Bash 路徑 `/d/claudecode/braintaiwan-md`）

---

### Task 1: `lib/hetero.js` — `parseReviewIssues()` 容錯解析

**Files:**
- Create: `lib/hetero.js`
- Test: `test/hetero.test.js`

**Interfaces:**
- Produces: `parseReviewIssues(raw: string) → Array<{quote, type, severity, description, suggestion}> | null`（null＝解析失敗、應觸發重試；`[]`＝合法的「無問題」）
- Produces: `REVIEW_JSON_CONTRACT`（字串常數，重試 prompt 也要用）

- [ ] **Step 1: 寫失敗測試**

建立 `test/hetero.test.js`：

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseReviewIssues } = require('../lib/hetero');

const issue = (over) => ({
  quote: 'q', type: 'clinical', severity: 'high', description: 'd', suggestion: 's', ...over,
});

test('乾淨 JSON 陣列 → 正常解析', () => {
  const r = parseReviewIssues(JSON.stringify([issue()]));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].quote, 'q');
  assert.strictEqual(r[0].suggestion, 's');
});

test('程式碼圍欄包裹 → 仍可解析', () => {
  const raw = '```json\n' + JSON.stringify([issue()]) + '\n```';
  assert.strictEqual(parseReviewIssues(raw).length, 1);
});

test('前後有雜訊文字 → 仍可解析', () => {
  const raw = '好的，以下是審查結果：\n' + JSON.stringify([issue()]) + '\n以上。';
  assert.strictEqual(parseReviewIssues(raw).length, 1);
});

test('空陣列 → 回 []（合法：無問題）', () => {
  assert.deepStrictEqual(parseReviewIssues('[]'), []);
});

test('非法 JSON → 回 null（觸發重試）', () => {
  assert.strictEqual(parseReviewIssues('抱歉我無法審查'), null);
  assert.strictEqual(parseReviewIssues('[{broken'), null);
});

test('非字串輸入 → null', () => {
  assert.strictEqual(parseReviewIssues(undefined), null);
  assert.strictEqual(parseReviewIssues(null), null);
});

test('缺 quote 或 description 的元素 → 丟棄，其餘保留', () => {
  const r = parseReviewIssues(JSON.stringify([issue(), { type: 'style' }]));
  assert.strictEqual(r.length, 1);
});

test('未知 type/severity → 正規化為 clinical/high（寧嚴勿鬆）', () => {
  const r = parseReviewIssues(JSON.stringify([issue({ type: 'weird', severity: 'huge' })]));
  assert.strictEqual(r[0].type, 'clinical');
  assert.strictEqual(r[0].severity, 'high');
});

test('suggestion 缺省 → 空字串', () => {
  const raw = JSON.stringify([{ quote: 'q', type: 'style', severity: 'low', description: 'd' }]);
  assert.strictEqual(parseReviewIssues(raw)[0].suggestion, '');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/hetero.test.js`
Expected: FAIL — `Cannot find module '../lib/hetero'`

- [ ] **Step 3: 最小實作**

建立 `lib/hetero.js`：

```js
'use strict';

// agy 審查輸出契約：重試 prompt 也要引用同一段文字，兩處不可分歧
const REVIEW_JSON_CONTRACT = [
  '你的輸出必須是一個 JSON 陣列，除此之外不得有任何文字（不要程式碼圍欄、不要說明）。每個元素：',
  '{"quote":"<草稿中有問題的原文片段>","type":"clinical|style|structure","severity":"high|low","description":"<問題說明>","suggestion":"<修改建議，可省略>"}',
  '沒有任何問題時輸出 []。',
].join('\n');

const VALID_TYPES = new Set(['clinical', 'style', 'structure']);
const VALID_SEVERITIES = new Set(['high', 'low']);

function extractCandidate(s) {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1];
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end < start) return null;
  return s.slice(start, end + 1);
}

function parseReviewIssues(raw) {
  if (typeof raw !== 'string') return null;
  const candidate = extractCandidate(raw.trim());
  if (candidate === null) return null;
  let arr;
  try {
    arr = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const issues = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    if (typeof it.quote !== 'string' || typeof it.description !== 'string') continue;
    issues.push({
      quote: it.quote,
      // 未知值正規化為最嚴格檔位：clinical/high，寧可多驚動仲裁也不漏
      type: VALID_TYPES.has(it.type) ? it.type : 'clinical',
      severity: VALID_SEVERITIES.has(it.severity) ? it.severity : 'high',
      description: it.description,
      suggestion: typeof it.suggestion === 'string' ? it.suggestion : '',
    });
  }
  return issues;
}

module.exports = { parseReviewIssues, REVIEW_JSON_CONTRACT };
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/hetero.test.js`
Expected: PASS（9 tests）

- [ ] **Step 5: 全套測試不回歸**

Run: `node --test`
Expected: 全部 PASS（既有 34+ 測試 + 新 9 測試）

- [ ] **Step 6: Commit**

```bash
git add lib/hetero.js test/hetero.test.js
git commit -m "feat(hetero): parseReviewIssues 容錯解析 agy 審查輸出"
```

---

### Task 2: `lib/hetero.js` — 工單與審查 prompt 組裝

**Files:**
- Modify: `lib/hetero.js`（Task 1 已建立）
- Test: `test/hetero.test.js`（追加）

**Interfaces:**
- Consumes: `REVIEW_JSON_CONTRACT`（Task 1）
- Produces: `buildDraftTicket({ briefMd, styleRulesMd, outFile }) → string`（寫入 `_tickets/NN-ticket.txt` 的完整工單，codex 以短 prompt 讀檔執行）
- Produces: `buildReviewPrompt({ draftMd, briefMd, sourceExcerpt }) → string`（寫入 `_review/NN-input.md` 的完整審查指示，agy 以短 prompt 讀檔執行）

**設計理由（實作者須知）**：Windows 命令列長度上限約 32K 字元，工單與草稿全文不能塞進 CLI 參數，因此兩者一律**落盤成檔**，CLI 只拿到「讀某檔並執行」的短 prompt。這也讓工單/審查輸入本身成為稽核產物。

- [ ] **Step 1: 追加失敗測試**

在 `test/hetero.test.js` 檔尾追加：

```js
const { buildDraftTicket, buildReviewPrompt, REVIEW_JSON_CONTRACT } = require('../lib/hetero');

test('buildDraftTicket 含輸出檔名、工單、風格規則與硬性限制', () => {
  const t = buildDraftTicket({ briefMd: 'BRIEF-BODY', styleRulesMd: 'STYLE-BODY', outFile: '01-intro.md' });
  assert.ok(t.includes('01-intro.md'));
  assert.ok(t.includes('BRIEF-BODY'));
  assert.ok(t.includes('STYLE-BODY'));
  assert.ok(t.includes('只准建立/覆寫'));
  assert.ok(t.includes('禁區'));
});

test('buildReviewPrompt 含三審查面向、JSON 契約、工單、源文、草稿', () => {
  const p = buildReviewPrompt({ draftMd: 'DRAFT-BODY', briefMd: 'BRIEF-BODY', sourceExcerpt: 'SOURCE-BODY' });
  assert.ok(p.includes('clinical'));
  assert.ok(p.includes('style'));
  assert.ok(p.includes('structure'));
  assert.ok(p.includes(REVIEW_JSON_CONTRACT));
  assert.ok(p.includes('BRIEF-BODY'));
  assert.ok(p.includes('SOURCE-BODY'));
  assert.ok(p.includes('DRAFT-BODY'));
});

test('buildReviewPrompt 要求只挑真問題、不改寫全文', () => {
  const p = buildReviewPrompt({ draftMd: 'd', briefMd: 'b', sourceExcerpt: 's' });
  assert.ok(p.includes('不確定就不要報'));
  assert.ok(p.includes('不要幫忙改寫全文'));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/hetero.test.js`
Expected: FAIL — `buildDraftTicket is not a function`

- [ ] **Step 3: 實作兩個模板函式**

在 `lib/hetero.js` 的 `module.exports` 前追加：

```js
function buildDraftTicket({ briefMd, styleRulesMd, outFile }) {
  return [
    `你是一個執行器。唯一任務：依下方工單，寫一篇繁體中文臨床導讀 markdown 到檔案 ${outFile}。`,
    '硬性限制：',
    `- 只准建立/覆寫 ${outFile}，不得動任何其他檔案。`,
    '- 不得擴大範圍；工單「禁區」列出的主題一律不談。',
    '- 「必述事實」必須全部涵蓋，數字與源文引文完全一致，不得自行換算或改寫數值。',
    '- 完成後不需要總結說明，寫完檔案即結束。',
    '',
    '## 工單',
    briefMd,
    '',
    '## 寫作風格規則（硬性，違反即重工）',
    styleRulesMd,
  ].join('\n');
}

function buildReviewPrompt({ draftMd, briefMd, sourceExcerpt }) {
  return [
    '你是最嚴格的臨床內容審查員。審查下方草稿，找出三類問題：',
    '- clinical：臨床邏輯與語境錯誤（數字對但用錯地方、量詞轄域寫反、適應症張冠李戴、與源文矛盾）',
    '- style：違反工單內「寫作風格規則」',
    '- structure：漏掉工單「必述事實」、必備段落不齊（frontmatter、摘要表、🩺 小評論、免責聲明）',
    '只挑真問題，不確定就不要報。不要幫忙改寫全文。',
    '',
    REVIEW_JSON_CONTRACT,
    '',
    '## 工單（含必述事實與風格規則）',
    briefMd,
    '',
    '## 源文相關段落（查核依據，最高權威）',
    sourceExcerpt,
    '',
    '## 草稿全文（審查對象）',
    draftMd,
  ].join('\n');
}
```

並把 `module.exports` 改為：

```js
module.exports = { parseReviewIssues, buildDraftTicket, buildReviewPrompt, REVIEW_JSON_CONTRACT };
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/hetero.test.js`
Expected: PASS（12 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/hetero.js test/hetero.test.js
git commit -m "feat(hetero): buildDraftTicket / buildReviewPrompt 工單與審查 prompt 組裝"
```

---

### Task 3: 真實 CLI 煙霧測試——釘死可用的呼叫型式

**Files:**
- Create: `docs/superpowers/plans/2026-07-03-hetero-smoke-results.md`（記錄實測結果，供 Task 4 寫 SKILL.md 引用）
- 臨時檔一律放 scratchpad，不進 repo

**Interfaces:**
- Consumes: `buildDraftTicket`、`buildReviewPrompt`、`parseReviewIssues`（Task 1-2）
- Produces: 實測驗證過的 codex/agy 呼叫指令模板（寫進結果檔，Task 4 逐字引用）

**目的**：spec §5.2/§5.3 的「CLI 讀檔執行」模式有兩個未實測假設——(a) codex 能照短 prompt 讀工單檔並寫出目標檔；(b) `agy -p` 無 `--dangerously-skip-permissions` 時能否讀檔（可能卡權限提示）。本 task 用最小輸入把兩者釘死，失敗變體要記錄下來。

- [ ] **Step 1: 準備最小工單與審查輸入**

在 scratchpad 建 `smoke/` 目錄，用 Node 呼叫 Task 1-2 的函式產生兩個檔：

```bash
SMOKE="$CLAUDE_SCRATCHPAD/smoke"   # 換成實際 scratchpad 絕對路徑
mkdir -p "$SMOKE"
cd /d/claudecode/braintaiwan-md
node -e "
const { buildDraftTicket } = require('./lib/hetero');
const fs = require('fs');
const ticket = buildDraftTicket({
  briefMd: '主題：測試段落。必述事實：阿斯匹靈常用低劑量為每日 100 mg（源文引文：aspirin 100 mg daily）。禁區：不談抗凝血劑。長度：兩段即可。',
  styleRulesMd: '直接進入主題，不寫開場白，不呼籲行動。',
  outFile: 'smoke-draft.md',
});
fs.writeFileSync(process.argv[1] + '/ticket.txt', ticket);
" "$SMOKE"
```

- [ ] **Step 2: 實測 codex exec 讀檔起草**

```bash
cd "$SMOKE"
codex exec --skip-git-repo-check "讀取本目錄的 ticket.txt，依工單內容執行。" </dev/null
test -s smoke-draft.md && echo DRAFT-OK || echo DRAFT-FAIL
```

Expected: `DRAFT-OK`，且 `smoke-draft.md` 內含「100 mg」。
若 FAIL：改試把工單全文直接當 prompt 參數（短工單塞得下）：`codex exec --skip-git-repo-check "$(cat ticket.txt)" </dev/null`，記錄哪個型式成功。

- [ ] **Step 3: 產生審查輸入檔**

```bash
cd /d/claudecode/braintaiwan-md
node -e "
const { buildReviewPrompt } = require('./lib/hetero');
const fs = require('fs');
const smoke = process.argv[1];
const prompt = buildReviewPrompt({
  draftMd: fs.readFileSync(smoke + '/smoke-draft.md', 'utf8'),
  briefMd: fs.readFileSync(smoke + '/ticket.txt', 'utf8'),
  sourceExcerpt: 'aspirin 100 mg daily',
});
fs.writeFileSync(smoke + '/review-input.md', prompt);
" "$SMOKE"
```

- [ ] **Step 4: 實測 agy 審查——依序試三個變體，記錄第一個成功者**

變體 A（讀檔，預期可能卡權限）：
```bash
cd "$SMOKE"
timeout 180 agy -p "讀取本目錄的 review-input.md，依其中指示輸出 JSON。" </dev/null
```
變體 B（stdin 管入內容）：
```bash
agy -p "依 stdin 內容中的指示輸出 JSON。" < review-input.md
```
變體 C（內容直接當參數——僅當 A、B 都失敗且輸入 < 25K 字元）：
```bash
agy -p "$(cat review-input.md)" </dev/null
```

每個變體的輸出丟給 `parseReviewIssues` 驗證：

```bash
node -e "
const { parseReviewIssues } = require('/d/claudecode/braintaiwan-md/lib/hetero');
const raw = require('fs').readFileSync(0, 'utf8');
const r = parseReviewIssues(raw);
console.log(r === null ? 'PARSE-FAIL' : 'PARSE-OK issues=' + r.length);
" < agy-output.txt
```

Expected: 至少一個變體 `PARSE-OK`（issues 數不限，0 也合法）。

- [ ] **Step 5: 寫結果檔**

建立 `docs/superpowers/plans/2026-07-03-hetero-smoke-results.md`，內容：每個實測變體｜成功/失敗｜實際輸出摘要｜**最終選定的 codex 與 agy 指令模板（逐字）**。這份檔案是 Task 4 SKILL.md 指令模板的唯一來源。

- [ ] **Step 6: 清理與 commit**

```bash
rm -rf "$SMOKE"
cd /d/claudecode/braintaiwan-md
git add docs/superpowers/plans/2026-07-03-hetero-smoke-results.md
git commit -m "test(hetero): codex/agy 真實 CLI 煙霧測試結果"
```

---

### Task 4: SKILL.md v3 重寫

**Files:**
- Modify: `.claude/skills/md-series/SKILL.md`（全檔重寫）

**Interfaces:**
- Consumes: `lib/hetero.js` 三函式（Task 1-2）、煙霧測試選定的指令模板（Task 3 結果檔）
- Consumes: 既有 `lib/gate.js` 的 `evaluateGate(ledgers, opts)`、`lib/report.js` 的 `renderReport(ledgers, gate)`（簽名不變）

**注意**：下方第 3、4 步的指令模板若與 Task 3 結果檔不符，**以結果檔為準**逐字替換。

- [ ] **Step 1: 全檔重寫 SKILL.md**

```markdown
---
name: md-series
description: 全自動產生一個 BrainTaiwan MD 臨床導讀系列——異質多代理版：Codex 起草、Antigravity 審查、Fable 仲裁、claim-ledger 驗證閘門，通過才 build+commit+push。觸發：使用者輸入 /md-series 或要求「自動做一個 X 系列」。
---

# md-series v3：異質多代理臨床導讀產線

主控→執行→審查→仲裁：Fable（主會話）切工單與仲裁、`codex exec` 起草、`agy -p` 異質審查、
現有 claim-gate 對「仲裁後」文本查核。閘門在仲裁之後——Fable 的修正也要過查核。

## 參數
`/md-series --src <pdf...> --topic "<主題>" --n <篇數> [--dry-run] [--no-gate] [--no-hetero] [--prefix <前綴>]`
- `--src`、`--topic`、`--n`、`--prefix`、`--dry-run`、`--no-gate`：同 v2 語意不變
- `--no-hetero`：跳過 Codex/agy，全退回純 Claude 模式（v2 流程：呼叫 Workflow `md-series-pipeline`）

## 0. Preflight（--no-hetero 時跳過）
- `codex login status` 輸出須含 `Logged in`
- `agy -p "Reply with exactly one word: OK" </dev/null` 須回 OK
- 任一失敗 → 告知使用者，詢問改用 `--no-hetero` 或中止。**不得默默降級整條產線。**
- 所有 codex/agy 呼叫一律 `</dev/null` 關 stdin，否則掛住。

## 1. Ingest
- 解析參數；`srcDir` 建議 `D:/claudecode/<prefix>-articles/`；確認來源 PDF 存在。
- `pdftotext` 轉出源文 txt。**已知瑕疵**：Lancet 風格 PDF 的小數點「·」常被吃成連字號
  （0.3–3.7% → 0–3% and 3–7%），數字類斷言查核前必須對照 PDF 人工核校 txt。

## 2. Plan（Fable，主會話）
- 讀源文 txt → 產 `series.json` 骨架（prefix/section/articles，欄位同 v2）。
- 每篇寫工單 `_tickets/<NN>-ticket.txt`：用 `lib/hetero.js` 的
  `buildDraftTicket({ briefMd, styleRulesMd, outFile })`。
  - `briefMd` 必含：範圍（涵蓋哪些源文段落）、必述事實（逐條附源文引文）、
    禁區（不得展開的相鄰主題）、長度與篇章結構。
  - `styleRulesMd`：注入「寫作風格禁忌」全文（不開場白、不呼籲行動、禁用詞清單、
    非咖啡廳閒聊語氣；摘要表＋🩺 小評論＋免責聲明必備）。

## 3. Draft（codex exec，可並行）
每篇（cwd = srcDir）：
    codex exec --skip-git-repo-check "讀取 _tickets/<NN>-ticket.txt，依工單內容執行。" </dev/null
- 完成檢查：`<NN>.md` 存在、非空、含 frontmatter。不合格重試 1 次。
- 連敗 2 次 → **Fable 親自起草該篇**，並於最終報告標記「該篇為 Claude 起草」。

## 4. Review（agy，可並行）
每篇：
1. 用 `buildReviewPrompt({ draftMd, briefMd, sourceExcerpt })` 產 `_review/<NN>-input.md`。
2. 呼叫（模板以煙霧測試結果檔為準）：
       agy -p "讀取 _review/<NN>-input.md，依其中指示輸出 JSON。" </dev/null > _review/<NN>-raw.txt
3. `parseReviewIssues(raw)` 解析 → 成功則存 `_review/<NN>-issues.json`。
4. 解析回 null → 重試 1 次（prompt 追加 REVIEW_JSON_CONTRACT 強調只輸出 JSON）。
5. 連敗 2 次 → 該篇標記「⚠ 未經異質審查」記入最終報告，不擋流程。

## 5. Arbitrate（Fable，主會話）
- 逐條 issue 判定 ACCEPT / REJECT ＋ 一句理由。準繩：源文為最高權威；
  風格類以「寫作風格禁忌」為準；suggestion 僅供參考，修法由 Fable 自定。
- ACCEPT → Fable 直接編輯該篇 `.md` 套用修正（不回 Codex，只一輪）。
- 全程寫 `_review-ledger.md`：每條 issue｜判定｜理由｜實際修改摘要。

## 6. Verify + Gate（現有機制，對「仲裁後」文本）
- 每篇派一個 Claude 子代理：讀最終 `.md` ＋ 源文 txt → 抽 claim ledger
  （`{ sentence, claimType, value, classification, sourceQuote }`，欄位同 v2）→
  寫 `_ledgers/<NN>.json`。
- 閘門（決定論）：`evaluateGate(ledgers, { noGate })`（`lib/gate.js`，不動）。
- 報告：`renderReport(ledgers, gate)` → `_verification-report.md`（無論過不過都寫）。
- `gate.pass === false` → **停**：不 build、不 commit/push，回報阻擋摘要。

## 7. Assemble + Publish（同 v2 不變）
- `node build.js <srcDir>/series.json` → 結構驗證（`validateDetailsBalance`）→
  （除非 --dry-run）git add／commit／push。commit 訊息同 v2 規則；
  --no-gate 時前綴「⚠ 未經驗證：」。

## 稽核產物
| 檔案 | 內容 |
|---|---|
| `_tickets/NN-ticket.txt` | 低熵工單 |
| `_review/NN-input.md` / `NN-raw.txt` / `NN-issues.json` | 審查輸入／原始輸出／解析後意見 |
| `_review-ledger.md` | 仲裁帳本（issue｜判定｜理由｜修改） |
| `_ledgers/NN.json`、`_verification-report.md` | claim ledger 與閘門報告 |

## 失敗行為
| 失敗點 | 行為 |
|---|---|
| preflight 不過 | 詢問 --no-hetero 或中止，不默默降級 |
| codex 起草連敗 2 次 | Fable 代打該篇，報告標記 |
| agy 審查連敗 2 次 | 該篇「⚠ 未經異質審查」，不擋流程 |
| Gate 未過 | 不 build、不 push，留全部稽核產物 |
| build／結構驗證／push 失敗 | 同 v2：不繼續，回報具體失敗點 |

## 醫療安全但書
驗證閘門只查「數字是否與源文相符」；異質審查補「語境與風格」層但只審一輪。
即使全過也產出報告與仲裁帳本供抽查。`--no-gate` 僅在明確知情時使用。
```

- [ ] **Step 2: 一致性檢查**

逐項核對（人工讀）：
- SKILL.md 引用的函式名（`buildDraftTicket`、`buildReviewPrompt`、`parseReviewIssues`、`evaluateGate`、`renderReport`、`validateDetailsBalance`）與 `lib/` 實際 export 一致
- 指令模板與 Task 3 結果檔逐字一致
- ledger 欄位與 `lib/gate.js` 期望一致（`claims` 陣列、`classification` 三值）

Run: `node --test`
Expected: 全部 PASS（SKILL.md 不影響測試，確認無誤觸）

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/md-series/SKILL.md
git commit -m "feat(md-series): SKILL.md v3 異質多代理流程（Codex 起草／agy 審查／Fable 仲裁）"
```

---

### Task 5: 端到端驗收（真實小系列 dry-run）

**Files:** 無新檔（產物在系列來源目錄與 repo 工作區，不 push）

**Interfaces:**
- Consumes: 完整 v3 流程（Task 1-4）

- [ ] **Step 1: 挑一個 1-2 篇的小主題跑 `/md-series --dry-run`**

用一份手邊已有的短 PDF（或既有系列源文 txt），`--n 1`，走完 Preflight → Plan → codex Draft → agy Review → 仲裁 → Verify → Gate → build，**不 commit 不 push**。

- [ ] **Step 2: 驗收清單**

- `_tickets/01-ticket.txt`、`_review/01-issues.json`、`_review-ledger.md`、`_verification-report.md` 四件稽核產物齊
- 仲裁帳本每條 issue 都有判定與理由
- `node build.js` 退出碼 0、index 結構驗證平衡
- `git status` 確認除預期產物外無雜檔

- [ ] **Step 3: 回報用戶**

彙報：codex/agy 實際表現、issue 數與仲裁 ACCEPT 率、單系列 token/時間成本觀察。**是否正式啟用（push）由用戶決定。**
