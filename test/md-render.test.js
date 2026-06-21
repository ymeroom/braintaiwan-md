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
