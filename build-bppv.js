// 將 bppv-articles 的 5 篇 .md 轉成站內風格 HTML 頁面
const fs = require('fs');
const path = require('path');

const SRC = 'D:/claudecode/bppv-articles';
const OUT = __dirname;
const SERIES_TAG = 'BPPV 臨床診斷與復位全攻略';

const articles = [
  { md: '01-pathophysiology.md',      out: 'bppv01.html', nav: '① 病生理與風險' },
  { md: '02-pc-bppv.md',              out: 'bppv02.html', nav: '② 後半規管 BPPV' },
  { md: '03-hc-bppv-basic.md',        out: 'bppv03.html', nav: '③ 水平半規管基本' },
  { md: '04-hc-bppv-advanced.md',     out: 'bppv04.html', nav: '④ 水平半規管進階' },
  { md: '05-ac-bppv-refractory.md',   out: 'bppv05.html', nav: '⑤ 前半規管與難治' },
];

function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function inline(s){
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m,c)=>{ codes.push(c); return `\x00${codes.length-1}\x00`; });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\x00(\d+)\x00/g, (m,i)=>`<code>${esc(codes[+i])}</code>`);
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
      html += `<h${lvl}>${inline(m[2].trim())}</h${lvl}>\n`;
      i++; continue;
    }
    if (/^>/.test(line)){
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])){
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html += `<blockquote>\n${renderBlocks(buf)}</blockquote>\n`;
      continue;
    }
    if (line.includes('|') && i+1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1]) && lines[i+1].includes('-')){
      const rows = [];
      while (i < lines.length && lines[i].includes('|')){ rows.push(lines[i]); i++; }
      const cells = r => r.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      let t = '<table>\n<thead><tr>' + head.map(c=>`<th>${inline(c)}</th>`).join('') + '</tr></thead>\n<tbody>\n';
      for (const r of body){ t += '<tr>' + r.map(c=>`<td>${inline(c)}</td>`).join('') + '</tr>\n'; }
      t += '</tbody></table>\n';
      html += t; continue;
    }
    if (/^\d+\.\s+/.test(line)){
      let l = '<ol>\n';
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])){
        l += `<li>${inline(lines[i].replace(/^\d+\.\s+/,''))}</li>\n`; i++;
      }
      l += '</ol>\n'; html += l; continue;
    }
    if (/^[-*]\s+/.test(line)){
      let l = '<ul>\n';
      while (i < lines.length && /^[-*]\s+/.test(lines[i])){
        l += `<li>${inline(lines[i].replace(/^[-*]\s+/,''))}</li>\n`; i++;
      }
      l += '</ul>\n'; html += l; continue;
    }
    const p = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,3}\s|>|---\s*$|\d+\.\s|[-*]\s)/.test(lines[i])
           && !(lines[i].includes('|') && i+1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1]))){
      p.push(lines[i]); i++;
    }
    if (p.length) html += `<p>${inline(p.join(' '))}</p>\n`;
  }
  return html;
}

function parse(src){
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
    desc = buf.join(' ').replace(/[*_`>#]/g, '').replace(/系列導讀．第\s*\d+\s*篇/, '').trim();
    if (desc.length > 110) desc = desc.slice(0, 110) + '…';
  }
  return { title, desc, body: renderBlocks(lines) };
}

function page(title, contentHtml, navItems, activeIdx, desc){
  const navHtml = navItems.map((n,i)=>
    `<a href="${n.out}" class="series-link${i===activeIdx?' active':''}">${n.nav}</a>`).join('');
  const url = `https://md.braintaiwan.com/${navItems[activeIdx].out}`;
  const d = desc || SERIES_TAG;
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — BrainTaiwan MD</title>
<meta name="description" content="${esc(d)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="BrainTaiwan">
<meta property="og:locale" content="zh_TW">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:image" content="https://md.braintaiwan.com/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://md.braintaiwan.com/og.png">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(d)}">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI','Microsoft JhengHei','PingFang TC',Arial,sans-serif;background:#f0f4f8;color:#1c1c2e;line-height:1.85}
header{background:linear-gradient(135deg,#0f2142 0%,#1a3975 55%,#1565c0 100%);color:#fff;padding:36px 32px 28px}
.header-inner{max-width:860px;margin:0 auto}
.site-name{font-size:11pt;font-weight:600;opacity:.65;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px}
.series-tag{font-size:11pt;opacity:.8;margin-bottom:6px}
.site-title{font-size:24pt;font-weight:700;line-height:1.35}
.header-nav{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
.nav-link{color:rgba(255,255,255,.65);text-decoration:none;font-size:11pt;padding:4px 12px;border:1px solid rgba(255,255,255,.22);border-radius:20px;transition:all .2s}
.nav-link:hover{background:rgba(255,255,255,.18);color:#fff;border-color:rgba(255,255,255,.45)}
main{max-width:860px;margin:0 auto;padding:28px 24px}
.series-nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px}
.series-link{font-size:11pt;text-decoration:none;color:#546e7a;background:#fff;border:1px solid #e0e8f5;padding:5px 12px;border-radius:20px}
.series-link:hover{color:#1565c0;border-color:#1565c0}
.series-link.active{background:#1565c0;color:#fff;border-color:#1565c0;font-weight:600}
.pager{display:flex;justify-content:space-between;gap:14px;margin-top:30px}
.pager-link{display:flex;flex-direction:column;gap:4px;max-width:48%;text-decoration:none;background:#fff;border:1px solid #e0e8f5;border-radius:10px;padding:12px 18px;transition:all .2s}
.pager-link:hover{border-color:#1565c0;box-shadow:0 4px 14px rgba(21,101,192,.12)}
.pager-link.next{align-items:flex-end;text-align:right}
.pager-dir{font-size:11pt;color:#90a4ae;font-weight:600}
.pager-ttl{font-size:13.5pt;color:#0f2142;font-weight:700}
.article{background:#fff;border:1px solid #e0e8f5;border-radius:12px;padding:40px 46px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.article h1{font-size:23pt;color:#0f2142;line-height:1.4;margin:.1em 0 .5em}
.article h2{font-size:18pt;color:#0f2142;margin:1.8em 0 .7em;padding-left:12px;border-left:4px solid #1565c0;line-height:1.4}
.article h3{font-size:15pt;color:#1a3975;margin:1.5em 0 .4em}
.article p{margin:.85em 0;font-size:14pt;color:#263238}
.article a{color:#1565c0;text-decoration:none}
.article hr{border:none;border-top:1px solid #e0e8f5;margin:2em 0}
.article strong{color:#0f2142}
blockquote{margin:1.5em 0;padding:16px 20px;background:#eef4fb;border-left:4px solid #1565c0;border-radius:0 8px 8px 0;color:#37474f;font-size:13pt}
table{width:100%;border-collapse:collapse;margin:1.3em 0;font-size:12.5pt;border:1px solid #e0e8f5;border-radius:8px;overflow:hidden}
th,td{padding:10px 13px;text-align:left;border-bottom:1px solid #eef2f7}
th{background:#0f2142;color:#fff;font-weight:600}
tr:nth-child(even) td{background:#f6f9fd}
code{background:#eef2f7;padding:1px 6px;border-radius:5px;font-size:.9em}
ol,ul{padding-left:1.5em;margin:.6em 0}
li{margin:.3em 0;font-size:14pt;color:#263238}
footer{background:#0f2142;color:rgba(255,255,255,.45);text-align:center;padding:20px;font-size:10.5pt;margin-top:40px}
footer a{color:rgba(255,255,255,.55);text-decoration:none}
</style>
</head>
<body>
<header>
  <div class="header-inner">
    <div class="site-name">BrainTaiwan · MD</div>
    <div class="series-tag">${esc(SERIES_TAG)}</div>
    <div class="site-title">${esc(title)}</div>
    <nav class="header-nav">
      <a href="/" class="nav-link">← 臨床工具</a>
      <a href="https://braintaiwan.com" class="nav-link">首頁</a>
    </nav>
  </div>
</header>
<main>
  <div class="series-nav">${navHtml}</div>
  <article class="article">
${contentHtml}
  </article>
  <nav class="pager">
    ${activeIdx>0 ? `<a class="pager-link prev" href="${navItems[activeIdx-1].out}"><span class="pager-dir">← 上一篇</span><span class="pager-ttl">${navItems[activeIdx-1].nav}</span></a>` : '<span></span>'}
    ${activeIdx<navItems.length-1 ? `<a class="pager-link next" href="${navItems[activeIdx+1].out}"><span class="pager-dir">下一篇 →</span><span class="pager-ttl">${navItems[activeIdx+1].nav}</span></a>` : '<span></span>'}
  </nav>
</main>
<footer>© 2026 BrainTaiwan MD · <a href="https://braintaiwan.com">braintaiwan.com</a></footer>
</body>
</html>`;
}

const parsed = articles.map(a => {
  const src = fs.readFileSync(path.join(SRC, a.md), 'utf8');
  return { ...a, ...parse(src) };
});

parsed.forEach((a, idx) => {
  const html = page(a.title, a.body, parsed, idx, a.desc);
  fs.writeFileSync(path.join(OUT, a.out), html, 'utf8');
  console.log('寫出', a.out, '—', a.title);
});
console.log('BPPV 系列完成');
