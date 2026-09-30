// schema.org JSON-LD for MD article pages (idempotent; run last, after seo-build.js,
// because it reads the description / og:image that seo-build fills in):
//   MedicalWebPage (site) + Article (headline, author, dates, citation).
// Author links to the Person on braintaiwan.com; dates come from lib/page-dates.js;
// citation comes from the vetted per-series source in enhance-md-footer.js SERIES
// (pages of unregistered series simply get no citation).
const fs = require('fs');
const path = require('path');
const dates = require('./lib/page-dates');
const { SERIES, prefixOf } = require('./enhance-md-footer');

const root = __dirname;
const SITE = 'https://md.braintaiwan.com/';
const START = '<!-- bt-ld:start -->';
const END = '<!-- bt-ld:end -->';

const AUTHOR = {
  '@type': 'Person',
  '@id': 'https://braintaiwan.com/#person',
  name: '施懿恩',
  alternateName: 'Ian Shih',
  honorificSuffix: 'M.D., Ph.D.',
  jobTitle: '神經內科主任',
  url: 'https://braintaiwan.com/',
};
const PUBLISHER = { '@type': 'Organization', name: 'BrainTaiwan', url: 'https://braintaiwan.com/' };

const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (html, re) => { const m = html.match(re); return m ? decode(m[1].trim()) : undefined; };

// refs（完整文獻清單）優先；否則用頁尾的 source 字串，抓第一個 DOI。
// Lancet 類 DOI 含半形括號（10.1016/S0140-6736(17)30703-1），只在空白與全形標點處截斷。
function citationOf(meta) {
  const work = (name, doi, url) =>
    ({ '@type': 'CreativeWork', name, ...(doi ? { url: `https://doi.org/${doi}` } : url ? { url } : {}) });
  if (meta.refs) {
    const list = meta.refs.map(r => work(r.name, r.doi, r.url));
    return list.length === 1 ? list[0] : list;
  }
  const doi = meta.source.match(/doi:\s*(10\.\d{4,}\/[^\s（，；;,]+)/i);
  return work(meta.source, doi && doi[1].replace(/\.$/, ''));
}

function ldFor(file, html, d) {
  const url = SITE + file;
  const meta = SERIES[prefixOf(file)];
  const title = attr(html, /<title>([^<]+)<\/title>/i) || file;
  const article = {
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: title.replace(/\s*[—–|-]\s*BrainTaiwan MD\s*$/, ''),
    description: attr(html, /name=["']description["']\s+content=["']([^"']*)["']/i),
    image: attr(html, /property=["']og:image["']\s+content=["']([^"']*)["']/i),
    inLanguage: attr(html, /<html[^>]*\blang=["']([^"']+)["']/i) || 'zh-TW',
    datePublished: d.published,
    dateModified: d.modified,
    author: AUTHOR,
    publisher: PUBLISHER,
    mainEntityOfPage: { '@id': url },
    ...(meta && { citation: citationOf(meta) }),
  };
  const page = {
    '@type': 'MedicalWebPage',
    '@id': url,
    url,
    name: article.headline,
    inLanguage: article.inLanguage,
    isPartOf: { '@type': 'WebSite', name: 'BrainTaiwan MD', url: SITE },
    mainEntity: { '@id': article['@id'] },
  };
  // "</" inside a <script> would end it early
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': [page, article] }, null, 1)
    .replace(/<\//g, '<\\/');
  return `${START}\n<script type="application/ld+json">\n${json}\n</script>\n${END}`;
}

const only = process.argv.slice(2).filter(a => a.endsWith('.html'));
const store = dates.load();
let changed = 0, total = 0;
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  if (only.length && !only.includes(file)) continue;
  const fp = path.join(root, file);
  let html = fs.readFileSync(fp, 'utf8');
  if (!/<article[\s>]/.test(html) || !/<\/head>/i.test(html)) continue;
  total++;
  const before = html;
  const d = dates.dateFor(store, file, html);
  html = html.replace(/\s*<!-- bt-ld:start -->[\s\S]*?<!-- bt-ld:end -->/, '');
  html = html.replace(/<\/head>/i, m => `${ldFor(file, html, d)}\n${m}`);
  if (html !== before) { fs.writeFileSync(fp, html, 'utf8'); changed++; }
}
dates.save(store);
console.log(`Schema: ${total} article page(s), ${changed} updated.`);
