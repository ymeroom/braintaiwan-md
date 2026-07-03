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
