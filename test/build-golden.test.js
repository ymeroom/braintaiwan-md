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
