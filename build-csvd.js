// CSVD 綜論導讀 7 篇：只渲染頁面，不動 index.html
//
// 腦中風分類已存在於 index.html，且其中的 lsvd / cvt 子系列為手動嵌入。
// build.js 的 applyIndex() 在找不到 <!-- SERIES:csvd START --> 時，
// 會在 </main> 前插入一個全新的 <details class="topic">，
// 造成頁面出現第二個「腦中風」分類。因此這裡只呼叫 writePages()，
// index.html 的 SERIES:csvd 區塊維持手動維護。
const path = require('path');
const { loadSeries, writePages } = require('./build');

const seriesPath = process.argv[2]
  || path.join('D:/claudecode/csvd-articles', 'series.json');

const series = loadSeries(seriesPath);
writePages(series);
console.log(`完成 ${series.articles.length} 篇（index.html 未變動，請手動維護 SERIES:${series.prefix} 區塊）`);
