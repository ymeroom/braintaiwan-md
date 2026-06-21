// series.json 結構驗證（純函式，給 loadSeries 在邊界用）
function req(obj, path, cond){
  if (!cond) throw new Error(`series.json 無效：${path}`);
}

function assertSeriesShape(s){
  req(s, 'series', s && typeof s === 'object');
  for (const k of ['prefix','seriesTag','srcDir','outDir','byline']){
    req(s, k, typeof s[k] === 'string' && s[k].length > 0);
  }
  const sec = s.section;
  req(s, 'section', sec && typeof sec === 'object');
  for (const k of ['labelZh','labelEn','count','color','divider','sourceNote','metaKeyword']){
    req(s, `section.${k}`, typeof sec[k] === 'string' && sec[k].length > 0);
  }
  req(s, 'articles', Array.isArray(s.articles) && s.articles.length > 0);
  s.articles.forEach((a, i) => {
    for (const k of ['md','out','nav']){
      req(s, `articles[${i}].${k}`, typeof a[k] === 'string' && a[k].length > 0);
    }
    const c = a.card;
    req(s, `articles[${i}].card`, c && typeof c === 'object');
    for (const k of ['cat','title','desc']){
      req(s, `articles[${i}].card.${k}`, typeof c[k] === 'string' && c[k].length > 0);
    }
    req(s, `articles[${i}].card.tags`, Array.isArray(c.tags) && c.tags.length === 2
      && c.tags.every(t => typeof t === 'string' && t.length > 0));
  });
  return s;
}

module.exports = { assertSeriesShape };
