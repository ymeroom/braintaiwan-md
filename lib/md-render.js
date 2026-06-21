// 站內極簡 markdown 轉換器（自 build-phn.js 抽出，純函式、無相依）
function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderInline(s){
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m,c)=>{ codes.push(c); return `\x00${codes.length-1}\x00`; });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\x00(\d+)\x00/g, (m,i)=>`<code>${escapeHtml(codes[+i])}</code>`);
  return s;
}

function renderBlocks(lines){
  let html = '';
  let i = 0;
  while (i < lines.length){
    let line = lines[i];
    if (/^\s*$/.test(line)){ i++; continue; }
    if (/^---\s*$/.test(line)){ html += '<hr>\n'; i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))){
      const lvl = m[1].length;
      html += `<h${lvl}>${renderInline(m[2].trim())}</h${lvl}>\n`;
      i++; continue;
    }
    if (/^>/.test(line)){
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])){ buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      const raw = buf.join('\n');
      const cls = raw.includes('🩺') ? ' class="commentary"' : '';
      html += `<blockquote${cls}>\n${renderBlocks(buf)}</blockquote>\n`;
      continue;
    }
    if (line.includes('|') && i+1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1]) && lines[i+1].includes('-')){
      const rows = [];
      while (i < lines.length && lines[i].includes('|')){ rows.push(lines[i]); i++; }
      const cells = r => r.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      let t = '<table>\n<thead><tr>' + head.map(c=>`<th>${renderInline(c)}</th>`).join('') + '</tr></thead>\n<tbody>\n';
      for (const r of body){ t += '<tr>' + r.map(c=>`<td>${renderInline(c)}</td>`).join('') + '</tr>\n'; }
      t += '</tbody></table>\n';
      html += t; continue;
    }
    if (/^\d+\.\s+/.test(line)){
      let l = '<ol>\n';
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])){ l += `<li>${renderInline(lines[i].replace(/^\d+\.\s+/,''))}</li>\n`; i++; }
      l += '</ol>\n'; html += l; continue;
    }
    if (/^[-*]\s+/.test(line)){
      let l = '<ul>\n';
      while (i < lines.length && /^[-*]\s+/.test(lines[i])){ l += `<li>${renderInline(lines[i].replace(/^[-*]\s+/,''))}</li>\n`; i++; }
      l += '</ul>\n'; html += l; continue;
    }
    const p = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,3}\s|>|---\s*$|\d+\.\s|[-*]\s)/.test(lines[i])
           && !(lines[i].includes('|') && i+1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1]))){
      p.push(lines[i]); i++;
    }
    if (p.length) html += `<p>${renderInline(p.join(' '))}</p>\n`;
  }
  return html;
}

function parseArticle(src){
  let title = '';
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm){
    const t = fm[1].match(/title:\s*"?(.*?)"?\s*$/m);
    if (t) title = t[1];
    src = src.slice(fm[0].length);
  }
  const lines = src.split(/\r?\n/);
  const h1 = lines.findIndex(l => /^#\s+/.test(l));
  if (h1 !== -1) lines.splice(h1, 1);
  let desc = '';
  const bqStart = lines.findIndex(l => /^>/.test(l));
  if (bqStart !== -1){
    let j = bqStart; const buf = [];
    while (j < lines.length && /^>/.test(lines[j])){ buf.push(lines[j].replace(/^>\s?/, '')); j++; }
    desc = buf.join(' ')
      .replace(/[*_`>#]/g, '')
      .replace(/系列導讀．第\s*\d+\s*篇/, '')
      .replace(/^[\s　]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (desc.length > 110) desc = desc.slice(0, 110) + '…';
  }
  return { title, desc, body: renderBlocks(lines) };
}

module.exports = { escapeHtml, renderInline, renderBlocks, parseArticle };
