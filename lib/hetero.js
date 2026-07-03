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
  // arr 本身非空但每個元素都被丟棄（例如原文只是雜訊裡混進 [1] 這種引註方括號），
  // 不可視同合法的「無問題」空陣列——那樣會讓草稿在零審查下悄悄過關。強制重試。
  if (arr.length > 0 && issues.length === 0) return null;
  return issues;
}

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

function buildReviewPrompt({ draftMd, briefMd, sourceExcerpt, styleRulesMd }) {
  const parts = [
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
  ];
  if (styleRulesMd) {
    parts.push('', '## 寫作風格規則（審查依據）', styleRulesMd);
  }
  parts.push(
    '',
    '## 源文相關段落（查核依據，最高權威）',
    sourceExcerpt,
    '',
    '## 草稿全文（審查對象）',
    draftMd,
  );
  return parts.join('\n');
}

module.exports = { parseReviewIssues, buildDraftTicket, buildReviewPrompt, REVIEW_JSON_CONTRACT };
