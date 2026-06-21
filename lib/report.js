// 驗證報告 markdown（純函式）
function esc(s){ return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }

function verdictLine(gateResult){
  if (gateResult.unverified) return '# 驗證報告：⚠ 未經驗證（--no-gate）';
  return gateResult.pass ? '# 驗證報告：✅ PASS' : '# 驗證報告：⛔ BLOCKED';
}

function blockersSection(blockers){
  if (!blockers.length) return '';
  let s = '\n## ⛔ 阻擋項\n\n| 篇 | 句子 | 類別 | 判定 | 原因 |\n|----|------|------|------|------|\n';
  for (const b of blockers){
    s += `| ${esc(b.article)} | ${esc(b.sentence)} | ${esc(b.claimType)} | ${esc(b.classification)} | ${esc(b.reason)} |\n`;
  }
  return s;
}

function articleTable(lg){
  let s = `\n## ${esc(lg.article)}\n\n| 句子 | 類別 | 判定 | 源文佐證 |\n|------|------|------|----------|\n`;
  for (const c of lg.claims){
    s += `| ${esc(c.sentence)} | ${esc(c.claimType)} | ${esc(c.classification)} | ${esc(c.sourceQuote)} |\n`;
  }
  return s;
}

function renderReport(ledgers, gateResult){
  let out = verdictLine(gateResult) + '\n';
  out += blockersSection(gateResult.blockers || []);
  for (const lg of ledgers){ out += articleTable(lg); }
  return out;
}

module.exports = { renderReport };
