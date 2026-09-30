// Per-article dates for the MD site, stored in page-dates.json:
//   { "cvt01.html": { "published": "2026-06-23", "modified": "2026-07-18", "hash": "…" } }
// "modified" means the article's *content* changed, not that the file was rewritten:
// the hash covers only the visible article text, with build-injected blocks removed
// (TOC, footer, new-edition banner) and text segments sorted, so enhancer re-runs and
// the key-points move never count as an update. Seeded once from git history
// (`node lib/page-dates.js --seed`); afterwards enhancers call dateFor() on every build.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const STORE = path.join(root, 'page-dates.json');

function contentHash(html) {
  const m = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
  let body = m ? m[1] : html;
  body = body
    .replace(/<!-- bt-toc:start -->[\s\S]*?<!-- bt-toc:end -->/g, '')
    .replace(/<!-- bt-md-footer -->[\s\S]*?<!-- \/bt-md-footer -->/g, '')
    .replace(/<!-- new-edition:start -->[\s\S]*?<!-- new-edition:end -->/g, '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  const segs = body.split(/<[^>]+>/).map(s => s.replace(/\s+/g, '')).filter(Boolean).sort();
  return crypto.createHash('sha1').update(segs.join('\n')).digest('hex').slice(0, 16);
}

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, local (Asia/Taipei)

function load() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; }
}
function save(store) {
  const sorted = Object.fromEntries(Object.keys(store).sort().map(k => [k, store[k]]));
  fs.writeFileSync(STORE, JSON.stringify(sorted, null, 1) + '\n', 'utf8');
}

// Returns { published, modified } for file, updating store in place when the content changed.
function dateFor(store, file, html) {
  const hash = contentHash(html);
  const e = store[file];
  if (!e) { store[file] = { published: today(), modified: today(), hash }; }
  else if (e.hash !== hash) { e.modified = today(); e.hash = hash; }
  return store[file];
}

// One-off: rebuild the store from git history (oldest commit = published; last commit whose
// content hash differs from its predecessor = modified; uncommitted content change = today).
function seed(files) {
  const store = {};
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  for (const file of files) {
    const revs = git(['log', '--format=%H %cs', '--', file]).trim().split('\n').filter(Boolean)
      .map(l => { const [h, d] = l.split(' '); return { h, d }; }).reverse();
    const cur = contentHash(fs.readFileSync(path.join(root, file), 'utf8'));
    if (!revs.length) { store[file] = { published: today(), modified: today(), hash: cur }; continue; }
    let prev = null, modified = revs[0].d;
    for (const r of revs) {
      const h = contentHash(git(['show', `${r.h}:${file}`]));
      if (prev !== null && h !== prev) modified = r.d;
      prev = h;
    }
    if (cur !== prev) modified = today();
    store[file] = { published: revs[0].d, modified, hash: cur };
  }
  return store;
}

module.exports = { load, save, dateFor, contentHash, seed };

if (require.main === module && process.argv.includes('--seed')) {
  const files = fs.readdirSync(root).filter(f => f.endsWith('.html') &&
    /<article[\s>]/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  const store = seed(files);
  save(store);
  console.log(`page-dates.json seeded: ${files.length} article page(s).`);
}
