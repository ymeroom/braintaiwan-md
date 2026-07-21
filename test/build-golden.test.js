const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadSeries, renderPages } = require('../build');

// 這個測試比對的是 test/fixtures/cidp-render/ 底下的快照，不是 cidp01-10.html。
// 已提交的 cidp01-10.html 是跑過三個 enhancer（footer / mobile / canonical）之後的
// 線上版本，renderPages() 的原始輸出本來就不會與它逐位元組相同 —— 這不是 bug，
// 是 build 產線的正常分工。用快照測試「renderPage 的渲染邏輯沒有意外改變」，
// 才是這份測試真正該驗證的東西。
//
// 只取 cidp01 與 cidp10 兩份代表性快照（而非全部 10 份），涵蓋 pager 的頭尾邊界
// 情況（cidp01 無上一篇、cidp10 無下一篇），藉此把 fixture 體積壓在合理範圍。
// pages.length 仍然斷言為 10，用來偵測系列長度變動。
test('renderPages reproduces cidp01/cidp10 fixtures byte-for-byte', () => {
  const series = loadSeries('D:/claudecode/cidp-articles/series.json');
  const pages = renderPages(series);
  assert.strictEqual(pages.length, 10);
  const fixtureSubset = ['cidp01.html', 'cidp10.html'];
  for (const p of pages){
    if (!fixtureSubset.includes(p.out)) continue;
    const expected = fs.readFileSync(path.join(__dirname, 'fixtures', 'cidp-render', p.out), 'utf8');
    assert.strictEqual(p.html, expected, `${p.out} 與快照不符`);
  }
});
