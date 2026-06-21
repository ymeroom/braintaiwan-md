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

test('evaluateGate without opts still gates (CONTRADICTED blocks, not unverified)', () => {
  const r = evaluateGate([ledger('a', [claim({ classification: 'CONTRADICTED' })])]);
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.unverified, false);
});
