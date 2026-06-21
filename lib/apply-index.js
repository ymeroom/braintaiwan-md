const PALETTE = ['amber','blue','coral','green','indigo','purple','red','teal'];

function pickColor(indexHtml, requested){
  if (requested && requested !== 'auto') return requested;
  const counts = PALETTE.map(c => ({
    c, n: (indexHtml.match(new RegExp(`\\bd-${c}\\b`, 'g')) || []).length
  }));
  const unused = counts.find(x => x.n === 0);
  if (unused) return unused.c;
  return counts.sort((a,b) => a.n - b.n)[0].c; // 全用過→取最少
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildSectionHtml(series, color){
  const s = series.section;
  const cards = series.articles.map(a => {
    const tags = a.card.tags;
    return `        <a href="${a.out}" class="card">
          <div class="card-banner b-${color}"></div>
          <div class="card-body">
            <div class="card-cat">${esc(a.card.cat)}</div>
            <div class="card-title">${esc(a.card.title)}</div>
            <div class="card-desc">${esc(a.card.desc)}</div>
            <div class="card-foot">
              <div><span class="tag tag-${color}">${esc(tags[0])}</span><span class="tag tag-blue">${esc(tags[1])}</span></div>
              <span class="arrow">→</span>
            </div>
          </div>
        </a>`;
  }).join('\n\n');
  return `  <details class="topic">
    <summary class="topic-head">
      <span class="chev">▸</span>
      <span class="topic-dot d-${color}"></span>
      <span class="topic-label">${esc(s.labelZh)} <span class="topic-en">${esc(s.labelEn)}</span></span>
      <span class="topic-count">${esc(s.count)}</span>
    </summary>
    <div class="topic-body">

      <div style="display:flex;align-items:center;gap:12px;margin:4px 0 18px;">
        <span style="font-size:10.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#546e7a;white-space:nowrap;">${esc(s.divider)}</span>
        <div style="flex:1;height:1px;background:#e0ece4;"></div>
      </div>

      <div class="card-grid">

${cards}

      </div>

      <div class="guideline-note">
        <strong>資料來源</strong>：${s.sourceNote}
        <br><br>
        本系列為臨床指引導讀整理，供醫療專業人員教學參考，臨床決策請依個案評估。
      </div>

    </div>
  </details>`;
}

function validateDetailsBalance(indexHtml){
  const open = (indexHtml.match(/<details class="topic"[\s>]/g) || []).length;
  const close = (indexHtml.match(/<\/details>/g) || []).length;
  return { balanced: open === close, open, close };
}

function applySection(indexHtml, series){
  const startMark = `<!-- SERIES:${series.prefix} START -->`;
  const endMark = `<!-- SERIES:${series.prefix} END -->`;

  // If series already exists, extract color from existing section for idempotency
  let color = series.section.color;
  const startIdx = indexHtml.indexOf(startMark);
  if (startIdx !== -1){
    const endIdx = indexHtml.indexOf(endMark);
    if (endIdx === -1) throw new Error(`找到 ${startMark} 但缺 ${endMark}`);
    const existingBlock = indexHtml.slice(startIdx, endIdx + endMark.length);
    const colorMatch = existingBlock.match(/d-(\w+)/);
    if (colorMatch && PALETTE.includes(colorMatch[1])) color = colorMatch[1];
  }

  color = pickColor(indexHtml, color);
  const section = buildSectionHtml(series, color);
  const block = `  ${startMark}\n${section}\n  ${endMark}`;

  let out;
  if (startIdx !== -1){
    const endIdx = indexHtml.indexOf(endMark);
    const lineStart = indexHtml.lastIndexOf('\n', startIdx) + 1;
    const before = indexHtml.slice(0, lineStart);
    const after = indexHtml.slice(endIdx + endMark.length);
    out = before + block + after;
  } else {
    const mainClose = indexHtml.lastIndexOf('</main>');
    if (mainClose === -1) throw new Error('找不到 </main>');
    out = indexHtml.slice(0, mainClose) + block + '\n\n' + indexHtml.slice(mainClose);
  }

  // 補 meta keyword
  const kw = series.section.metaKeyword;
  if (kw && !out.includes(kw)){
    out = out.replace(/(<meta name="description" content="[^"]*?)("\s*>)/,
      (m, head, tail) => head.replace(/。$/, '') + `、${kw}。` + tail);
  }

  const bal = validateDetailsBalance(out);
  if (!bal.balanced) throw new Error(`details 不平衡 open=${bal.open} close=${bal.close}`);
  return out;
}

module.exports = { PALETTE, pickColor, buildSectionHtml, validateDetailsBalance, applySection };
