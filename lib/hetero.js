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
  return issues;
}

module.exports = { parseReviewIssues, REVIEW_JSON_CONTRACT };
