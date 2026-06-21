// 驗證閘門決策（純函式）
const HIGH_RISK = ['dose', 'percent', 'cutoff', 'criterion'];

function evaluateGate(ledgers, opts){
  const noGate = !!(opts && opts.noGate);
  const blockers = [];
  for (const lg of ledgers){
    for (const c of lg.claims){
      if (c.classification === 'CONTRADICTED'){
        blockers.push({ article: lg.article, sentence: c.sentence, claimType: c.claimType,
          classification: c.classification, reason: '與源文矛盾' });
      } else if (c.classification === 'NOT_FOUND' && HIGH_RISK.includes(c.claimType)){
        blockers.push({ article: lg.article, sentence: c.sentence, claimType: c.claimType,
          classification: c.classification, reason: `高風險類別(${c.claimType})未在源文找到` });
      }
    }
  }
  const pass = noGate ? true : blockers.length === 0;
  return { pass, unverified: noGate, blockers };
}

module.exports = { HIGH_RISK, evaluateGate };
