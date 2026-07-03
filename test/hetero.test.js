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

test('陣列非空但全被丟棄（如僅含引註噪音）→ 回 null（觸發重試，不可當作「無問題」）', () => {
  assert.strictEqual(parseReviewIssues('抱歉我無法審查，請見參考 [1]。'), null);
  assert.strictEqual(parseReviewIssues('[1, 2, 3]'), null);
});

test('真正的空陣列 → 仍回 []（合法：無問題，非全丟棄）', () => {
  assert.deepStrictEqual(parseReviewIssues('[]'), []);
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

test('buildReviewPrompt 帶 styleRulesMd → 內含風格規則內文與標題', () => {
  const p = buildReviewPrompt({ draftMd: 'd', briefMd: 'b', sourceExcerpt: 's', styleRulesMd: 'STYLE-XYZ' });
  assert.ok(p.includes('STYLE-XYZ'));
  assert.ok(p.includes('寫作風格規則'));
});

test('buildReviewPrompt 不帶 styleRulesMd → 不含風格規則標題，且原有斷言不變', () => {
  const p = buildReviewPrompt({ draftMd: 'DRAFT-BODY', briefMd: 'BRIEF-BODY', sourceExcerpt: 'SOURCE-BODY' });
  assert.ok(!p.includes('寫作風格規則（審查依據）'));
  assert.ok(p.includes('clinical'));
  assert.ok(p.includes('style'));
  assert.ok(p.includes('structure'));
  assert.ok(p.includes(REVIEW_JSON_CONTRACT));
  assert.ok(p.includes('BRIEF-BODY'));
  assert.ok(p.includes('SOURCE-BODY'));
  assert.ok(p.includes('DRAFT-BODY'));
});
