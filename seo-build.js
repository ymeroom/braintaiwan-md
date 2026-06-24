// SEO builder for a BrainTaiwan GitHub Pages site.
// Reads ./CNAME for the domain, then for every real (non-redirect) page:
//   - ensures a self-referential <link rel="canonical">
//   - ensures <meta property="og:url"> (= canonical)
//   - adds a default og:image / twitter:image when the page has none
// Finally writes sitemap.xml + robots.txt. Idempotent: re-run anytime.
const fs = require('fs');
const path = require('path');

const root = __dirname;
const domain = fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim();

// recursively collect .html, skipping vendored / partial / test paths
function walk(dir, rel = '') {
  let out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (['node_modules', '.git', 'test', 'posts/og', 'og'].includes(r) || /(^|\/)(node_modules|\.git|test)$/.test(r)) continue;
      out = out.concat(walk(path.join(dir, ent.name), r));
    } else if (ent.name.endsWith('.html') && !ent.name.startsWith('_')) {
      out.push(r);
    }
  }
  return out;
}

function urlFor(rel) {
  return rel === 'index.html' ? `https://${domain}/` : `https://${domain}/${rel}`;
}

const pages = [];
let enhanced = 0;

for (const rel of walk(root)) {
  const file = path.join(root, rel);
  let html = fs.readFileSync(file, 'utf8');

  // redirect stubs never get a self-canonical and stay out of the sitemap
  if (/http-equiv=["']refresh["']/i.test(html)) continue;
  if (!/<\/head>/i.test(html)) continue;

  const url = urlFor(rel.split(path.sep).join('/'));
  const before = html;

  // 1) canonical — replace existing or insert before </head>
  const canon = `<link rel="canonical" href="${url}">`;
  if (/<link[^>]*rel=["']canonical["'][^>]*>/i.test(html)) {
    html = html.replace(/<link[^>]*rel=["']canonical["'][^>]*>/i, canon);
  } else {
    html = html.replace(/<\/head>/i, `${canon}\n</head>`);
  }

  // 2) og:url — add if missing
  if (!/property=["']og:url["']/i.test(html)) {
    html = html.replace(/<\/head>/i, `<meta property="og:url" content="${url}">\n</head>`);
  }

  // 3) default og:image — only when the page has none
  if (!/property=["']og:image["']/i.test(html)) {
    const img = `https://${domain}/og.png`;
    const block = [
      `<meta property="og:image" content="${img}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${img}">`,
    ].join('\n');
    html = html.replace(/<\/head>/i, `${block}\n</head>`);
  }

  // 4) fill remaining share/SEO meta (og:type, og:title, description, og:description, twitter:card)
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const titleM = html.match(/<title>([^<]+)<\/title>/i);
  const titleTxt = titleM ? titleM[1].trim() : domain;       // already HTML-escaped text
  const isArticle = /<article[\s>]/i.test(html);

  // description: keep existing (already attribute-encoded), else derive from .tool-sub / first <p> / title
  const descM = html.match(/name=["']description["']\s+content=["']([^"']*)["']/i);
  let descSafe;
  if (descM) {
    descSafe = descM[1];
  } else {
    const sub = html.match(/class=["']tool-sub["'][^>]*>([^<]+)</i);
    const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    let raw = sub ? sub[1] : (p ? p[1].replace(/<[^>]+>/g, '') : titleTxt);
    raw = raw.replace(/\s+/g, ' ').trim().slice(0, 150);
    descSafe = esc(raw);
    html = html.replace(/<\/head>/i, `<meta name="description" content="${descSafe}">\n</head>`);
  }
  if (!/property=["']og:type["']/i.test(html))
    html = html.replace(/<\/head>/i, `<meta property="og:type" content="${isArticle ? 'article' : 'website'}">\n</head>`);
  if (!/property=["']og:title["']/i.test(html))
    html = html.replace(/<\/head>/i, `<meta property="og:title" content="${titleTxt}">\n</head>`);
  if (!/property=["']og:description["']/i.test(html))
    html = html.replace(/<\/head>/i, `<meta property="og:description" content="${descSafe}">\n</head>`);
  if (/property=["']og:image["']/i.test(html) && !/name=["']twitter:card["']/i.test(html))
    html = html.replace(/<\/head>/i, `<meta name="twitter:card" content="summary_large_image">\n</head>`);

  if (html !== before) { fs.writeFileSync(file, html, 'utf8'); enhanced++; }
  pages.push(url);
}

pages.sort();

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap, 'utf8');

const robots = `User-agent: *
Allow: /

Sitemap: https://${domain}/sitemap.xml
`;
fs.writeFileSync(path.join(root, 'robots.txt'), robots, 'utf8');

console.log(`[${domain}] ${pages.length} URLs in sitemap; head-enhanced ${enhanced} page(s); robots.txt written.`);
