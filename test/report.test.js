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
