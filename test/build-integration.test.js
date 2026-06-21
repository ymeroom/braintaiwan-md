const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applySection } = require('../lib/apply-index');

test('applySection on a temp index keeps balance and adds section', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-'));
  const idxPath = path.join(tmp, 'index.html');
  fs.copyFileSync(__dirname + '/fixtures/index-min.html', idxPath);
  const series = {
    prefix: 'demo', byline: 'X',
    section: { labelZh: '示範', labelEn: 'Demo', count: '1 篇', color: 'auto', divider: 'd', sourceNote: 's', metaKeyword: 'DEMO' },
    articles: [{ out: 'demo01.html', nav: '① 一', card: { cat: '導讀 ①', title: 'T', desc: 'D', tags: ['a','b'] } }]
  };
  const updated = applySection(fs.readFileSync(idxPath, 'utf8'), series);
  fs.writeFileSync(idxPath, updated, 'utf8');
  const round = fs.readFileSync(idxPath, 'utf8');
  assert.match(round, /<!-- SERIES:demo START -->/);
  assert.match(round, /T<\/div>/);
});
