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

test('validateDetailsBalance counts <details class="topic" open> (with attribute)', () => {
  const html = '<details class="topic" open>x</details>\n<details class="topic">y</details>';
  assert.deepStrictEqual(validateDetailsBalance(html), { balanced: true, open: 2, close: 2 });
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

test('applySection idempotent when pre-marker line ends with </details> (no trailing spaces)', () => {
  // Build an index where the line before </main> ends with </details> (no trailing spaces)
  const indexWithDetails = `<!DOCTYPE html>
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
</html>`;
  const once = applySection(indexWithDetails, series);
  const twice = applySection(once, series);
  // (a) idempotent
  assert.strictEqual(twice, once, 'Re-apply must be byte-identical');
  // (b) marker present and details balanced
  assert.match(once, /<!-- SERIES:demo START -->/);
  assert.strictEqual(validateDetailsBalance(once).balanced, true);
});

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
