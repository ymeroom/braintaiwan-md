// Mobile fixes for MD article pages:
//   1) wrap every in-article <table> in a horizontal-scroll container so wide
//      clinical tables scroll instead of pushing the page sideways on phones;
//   2) let long unbreakable tokens (DOIs, long drug/antibody names) wrap.
// Idempotent: re-run anytime. Only touches pages with <article> (skips the wide
// infographic layouts, which have no <article> and may contain divs in tables).
const fs = require('fs');
const path = require('path');

const root = __dirname;
const CSS = `/* bt-mobile:start */
article, article *{overflow-wrap:break-word}
.bt-tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;margin:1.3em 0}
.bt-tablewrap>table{margin:0}
/* bt-mobile:end */`;

let changed = 0;
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  const fp = path.join(root, file);
  let html = fs.readFileSync(fp, 'utf8');
  if (!/<article[\s>]/i.test(html)) continue;
  const before = html;

  // 1) managed CSS block — replace any prior version, then insert before </style>
  html = html.replace(/\/\* bt-mobile:start \*\/[\s\S]*?\/\* bt-mobile:end \*\/\n?/, '');
  html = html.replace('</style>', `${CSS}\n</style>`);

  // 2) tables: unwrap any existing wrapper (article tables contain no divs, so the
  //    first </div> after the wrapper open is the wrapper's own close), then re-wrap
  html = html.replace(/<div class="bt-tablewrap">([\s\S]*?)<\/div>/g, '$1');
  html = html.replace(/<table\b[\s\S]*?<\/table>/g, m => `<div class="bt-tablewrap">${m}</div>`);

  if (html !== before) { fs.writeFileSync(fp, html, 'utf8'); changed++; }
}
console.log(`Mobile-enhanced ${changed} MD article page(s).`);
