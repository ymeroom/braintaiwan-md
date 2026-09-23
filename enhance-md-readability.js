// Readability pass for md.braintaiwan.com (idempotent: re-run anytime, after build and
// after enhance-md-footer / enhance-md-mobile):
//   1) article pages: mobile padding fix — on phones .article kept 46px side padding and
//      main kept 24px, so 🩺 commentary boxes were ~170px wide (8–9 CJK chars per line);
//   2) article pages with ≥3 <h2>: reading time + collapsible table of contents,
//      inserted right after the opening series blockquote (or at the top of <article>);
//   3) index.html: instant client-side search over all cards.
const fs = require('fs');
const path = require('path');

const root = __dirname;

const ARTICLE_CSS = `/* bt-read:start */
@media(max-width:600px){
main{padding:16px 8px}
.article{padding:22px 16px;border-radius:10px}
blockquote{padding:12px 14px;margin:1.2em 0}
.article p{font-size:13pt}
.article li{font-size:13pt}
.bt-tablewrap th,.bt-tablewrap td{min-width:6.5em}
}
.bt-toc{margin:1.2em 0 1.6em;padding:14px 18px;background:#f5f8fc;border:1px solid #e0e8f5;border-radius:10px;font-size:11.5pt}
.bt-toc summary{cursor:pointer;font-weight:700;color:#0f2142;list-style:none}
.bt-toc summary::-webkit-details-marker{display:none}
.bt-toc summary::before{content:"▸ ";color:#1565c0}
.bt-toc[open] summary::before{content:"▾ "}
.bt-toc .bt-rt{font-weight:400;color:#607d8b;margin-left:8px}
.bt-toc ol{margin:.6em 0 0;padding-left:1.4em;line-height:1.9}
.bt-toc a{color:#1565c0;text-decoration:none}
.bt-toc a:hover{text-decoration:underline}
.article h2[id]{scroll-margin-top:16px}
.bt-keypoints{margin:1.4em 0 1.2em;padding:6px 18px 12px;background:#fffdf5;border:1px solid #f3e3b5;border-radius:10px}
.bt-keypoints h2{margin-top:.8em}
@media(max-width:600px){.bt-keypoints{padding:4px 10px 10px}}
/* bt-read:end */`;

// CJK ≈ 400 字/分（專業文本放慢），拉丁詞 ≈ 200 詞/分
function readingMinutes(text) {
  const cjk = (text.match(/[㐀-鿿豈-﫿]/g) || []).length;
  const words = (text.replace(/[㐀-鿿豈-﫿]/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9.\-/]*/g) || []).length;
  return Math.max(1, Math.round(cjk / 400 + words / 200));
}
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

let articles = 0, tocs = 0, moved = 0;
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'index.html')) {
  const fp = path.join(root, file);
  let html = fs.readFileSync(fp, 'utf8');
  const m = html.match(/<article class="article">([\s\S]*?)<\/article>/);
  if (!m) continue;
  const before = html;

  // 1) managed CSS
  html = html.replace(/\/\* bt-read:start \*\/[\s\S]*?\/\* bt-read:end \*\/\n?/, '');
  html = html.replace('</style>', `${ARTICLE_CSS}\n</style>`);

  let body = m[1].replace(/\s*<!-- bt-toc:start -->[\s\S]*?<!-- bt-toc:end -->/, '');

  // 1b) 重點前移：「臨床要點摘要…／臨床判讀重點」若標題下緊接表格或清單，整段（h2＋該表格/清單）
  //     移到開頭導讀之後，包成 .bt-keypoints。散文型（標題下是段落）不動。已搬過的頁面有 marker，不重搬。
  if (!body.includes('<!-- bt-key:start -->')) {
    const blocks = [];
    body = body.replace(
      /<h2(?: id="bt-s\d+")?>((?:臨床要點摘要[^<]*|臨床判讀重點))<\/h2>(\s*(?:<div class="bt-tablewrap"><table[\s\S]*?<\/table><\/div>|<table[\s\S]*?<\/table>|<ul>[\s\S]*?<\/ul>))/g,
      (_, title, block) => { blocks.push(`<h2>${title}</h2>${block}`); return ''; });
    if (blocks.length) {
      const key = `<!-- bt-key:start --><section class="bt-keypoints">${blocks.join('\n')}</section><!-- bt-key:end -->`;
      const bq0 = body.match(/^\s*(?:<!-- new-edition:start -->[\s\S]*?<!-- new-edition:end -->\s*)?<blockquote>[\s\S]*?<\/blockquote>/);
      body = bq0 ? body.slice(0, bq0[0].length) + '\n' + key + body.slice(bq0[0].length) : '\n' + key + body;
      moved++;
    }
  }

  // 2) TOC + reading time
  let n = 0;
  const heads = [];
  body = body.replace(/<h2(?: id="bt-s\d+")?>([\s\S]*?)<\/h2>/g, (_, inner) => {
    n++;
    heads.push({ id: `bt-s${n}`, text: strip(inner) });
    return `<h2 id="bt-s${n}">${inner}</h2>`;
  });
  if (heads.length >= 3) {
    const mins = readingMinutes(strip(body));
    const toc = `<!-- bt-toc:start --><details class="bt-toc" open><summary>本文目錄<span class="bt-rt">約 ${mins} 分鐘閱讀</span></summary><ol>${heads.map(h => `<li><a href="#${h.id}">${h.text}</a></li>`).join('')}</ol></details><!-- bt-toc:end -->`;
    // 放在開頭導讀 blockquote 之後；沒有就放在 article 最前面
    const bq = body.match(/^\s*(?:<!-- new-edition:start -->[\s\S]*?<!-- new-edition:end -->\s*)?<blockquote>[\s\S]*?<\/blockquote>(?:\s*<!-- bt-key:start -->[\s\S]*?<!-- bt-key:end -->)?/);
    body = bq ? body.slice(0, bq[0].length) + '\n' + toc + body.slice(bq[0].length) : '\n' + toc + body;
    tocs++;
  }
  html = html.replace(m[0], `<article class="article">${body}</article>`);

  if (html !== before) { fs.writeFileSync(fp, html, 'utf8'); }
  articles++;
}

// 3) index search
const INDEX_CSS = `/* bt-search:start */
.bt-search{max-width:1160px;margin:8px auto 18px;padding:0 20px}
.bt-search input{width:100%;box-sizing:border-box;padding:13px 18px;font-size:13pt;border:2px solid #cfd8e3;border-radius:28px;outline:none;background:#fff}
.bt-search input:focus{border-color:#1565c0}
.bt-search-hint{margin:8px 6px 0;font-size:10.5pt;color:#607d8b;min-height:1.4em}
.bt-hide{display:none !important}
/* bt-search:end */`;
const SEARCH_HTML = `<!-- bt-search:start -->
  <div class="bt-search"><input type="search" id="bt-q" placeholder="搜尋全站導讀：藥名、疾病、指引…（例如 rimegepant、癲癇重積、CIDP）" autocomplete="off" aria-label="搜尋導讀"><div class="bt-search-hint" id="bt-hint"></div></div>
  <script>
  (function(){
    var q=document.getElementById('bt-q'),hint=document.getElementById('bt-hint');
    // 腳本位於分類區塊之前，執行當下卡片尚未解析；改在第一次搜尋時才收集
    var topics,initOpen,cards,grids;
    function init(){
      if(cards)return;
      topics=[].slice.call(document.querySelectorAll('details.topic'));
      initOpen=topics.map(function(d){return d.open});
      cards=[].slice.call(document.querySelectorAll('a.card'));
      grids=[].slice.call(document.querySelectorAll('.card-grid'));
      cards.forEach(function(c){c._t=c.textContent.toLowerCase().replace(/\\s+/g,' ')});
    }
    function sib(el,dir){var s=el[dir];return s&&s.nodeType===1?s:null}
    function run(){
      init();
      var terms=q.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);
      document.querySelectorAll('.bt-hide').forEach(function(e){e.classList.remove('bt-hide')});
      if(!terms.length){topics.forEach(function(d,i){d.open=initOpen[i]});hint.textContent='';return}
      var hit=0;
      cards.forEach(function(c){var ok=terms.every(function(t){return c._t.indexOf(t)>-1});if(ok)hit++;else c.classList.add('bt-hide')});
      grids.forEach(function(g){
        if(g.querySelector('a.card:not(.bt-hide)'))return;
        g.classList.add('bt-hide');
        var p=sib(g,'previousElementSibling');if(p&&!p.classList.contains('card-grid')&&p.tagName==='DIV'&&!p.className)p.classList.add('bt-hide');
        var nx=sib(g,'nextElementSibling');if(nx&&nx.classList.contains('guideline-note'))nx.classList.add('bt-hide');
      });
      topics.forEach(function(d){var any=d.querySelector('a.card:not(.bt-hide)');d.open=!!any;if(!any)d.classList.add('bt-hide')});
      hint.textContent=hit?('找到 '+hit+' 篇'):'找不到符合的導讀，試試其他關鍵字';
    }
    var t;q.addEventListener('input',function(){clearTimeout(t);t=setTimeout(run,120)});
  })();
  </script>
  <!-- bt-search:end -->
`;
{
  const fp = path.join(root, 'index.html');
  let html = fs.readFileSync(fp, 'utf8');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  html = html.replace(/\/\* bt-search:start \*\/[\s\S]*?\/\* bt-search:end \*\/\r?\n?/, '');
  html = html.replace(/<!-- bt-search:start -->[\s\S]*?<!-- bt-search:end -->\r?\n?/, '');
  html = html.replace('</style>', INDEX_CSS.replace(/\n/g, eol) + eol + '</style>');
  const anchor = '<details class="topic"';
  const i = html.indexOf(anchor);
  if (i < 0) throw new Error('index: no topic found');
  // 插在第一個分類那一行之前；若上一行是該分類的註解（如 <!-- 梗塞性腦中風 -->），連註解一起讓位
  let at = html.lastIndexOf('\n', i) + 1;
  const prevStart = html.lastIndexOf('\n', at - 2) + 1;
  if (/^\s*<!--[^>]*-->\s*$/.test(html.slice(prevStart, at))) at = prevStart;
  html = html.slice(0, at) + SEARCH_HTML.replace(/\n/g, eol) + html.slice(at);
  fs.writeFileSync(fp, html, 'utf8');
}

console.log(`Readability: ${articles} article page(s), ${tocs} with TOC, ${moved} key-points moved this run; index search installed.`);
