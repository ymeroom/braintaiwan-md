const { test } = require('node:test');
const assert = require('node:assert');
const { assertSeriesShape } = require('../lib/series-schema');

function valid(){
  return {
    prefix: 'demo', seriesTag: 'T', srcDir: '/s', outDir: '/o', byline: 'B',
    section: { labelZh: 'z', labelEn: 'e', count: 'c', color: 'auto', divider: 'd', sourceNote: 's', metaKeyword: 'k' },
    articles: [{ md: '01.md', out: 'demo01.html', nav: '① 一', card: { cat: '導讀 ①', title: 't', desc: 'd', tags: ['a','b'] } }]
  };
}

test('valid series passes and returns itself', () => {
  const s = valid();
  assert.strictEqual(assertSeriesShape(s), s);
});

test('missing top-level field throws naming the field', () => {
  const s = valid(); delete s.seriesTag;
  assert.throws(() => assertSeriesShape(s), /seriesTag/);
});

test('empty articles array throws', () => {
  const s = valid(); s.articles = [];
  assert.throws(() => assertSeriesShape(s), /articles/);
});

test('article missing card.tags pair throws naming the article', () => {
  const s = valid(); s.articles[0].card.tags = ['only-one'];
  assert.throws(() => assertSeriesShape(s), /tags/);
});

test('section missing color throws', () => {
  const s = valid(); delete s.section.color;
  assert.throws(() => assertSeriesShape(s), /section\.color/);
});
