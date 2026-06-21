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
