// Injects a consistent footer block (指引版本／來源 · 最後更新 · 適用對象 + 訂閱 CTA)
// into every MD series article. Idempotent: re-run anytime; it replaces its own block.
// Mirrors the ER repo's enhance-tool-*.js approach (build-time HTML rewrite, marker-guarded).
const fs = require('fs');
const path = require('path');
const glob = (dir, re) => fs.readdirSync(dir).filter(f => re.test(f));

const root = __dirname;
const START = '<!-- bt-md-footer -->';
const END = '<!-- /bt-md-footer -->';
const UPDATED = '2026.06';
const SUBSCRIBE = 'https://media.braintaiwan.com/subscribe.html';

// Source strings are summarised from each series' own published end-of-article
// disclaimer (vetted text), not invented. Series not listed here are skipped.
const DEFAULT_AUDIENCE = '神經科及相關專科醫療人員（教學與臨床參考）';
const SERIES = {
  adx:  { source: '2025 AA DETeCD-ADRD 指引（基層醫療版）' },
  adxs: { source: '2025 AA DETeCD-ADRD 指引（專科醫療版）' },
  adxt: { source: '2025 AA DETeCD-ADRD 指引（臨床評估工具附錄）' },
  ais:  { source: '2026 AHA/ASA 急性缺血性中風指引' },
  apd:  { source: 'CurePSP 2024 非典型巴金森症候群診斷共識' },
  bbm:  { source: "2025 Alzheimer's Association 血液生物標記臨床指引" },
  bp:   { source: "AAO-HNS 2013 Bell's palsy 臨床實務指引" },
  bppv: { source: 'BPPV 病生理與復位治療臨床整理' },
  cbm:  { source: '失智症血液生物標記之臨床導讀（批判性整理）', audience: '醫療人員與關心失智檢測的讀者' },
  ch:   { source: '台灣頭痛學會 2022 叢發性頭痛治療準則' },
  cidp: { source: 'EAN/PNS 2021 指引與 2024–2025 綜述' },
  dmd:  { source: 'AAN 2025 Evidence in Focus（Oskoui et al.）' },
  dmdx: { source: 'ADA Standards of Care in Diabetes 2026 · 第 2 章 診斷與分類', audience: '內科、家醫、內分泌及相關專科醫療人員（教學與臨床參考）' },
  etomidate: { source: '依託咪酯中毒之神經毒理臨床整理', audience: '急診、毒物與神經科醫療人員' },
  fab:  { source: 'Germain et al. 2022 classic Fabry disease 專家共識' },
  fs:   { source: 'AAN 2026 功能性癲癇發作實踐指引（Tolchin et al.）' },
  hz:   { source: '帶狀皰疹當代臨床整理（綜合多項權威來源）' },
  ins:  { source: '失眠症國際指引彙編' },
  mg:   { source: 'StatPearls 重症肌無力（NCBI NBK559331）' },
  mig:  { source: '台灣頭痛學會 2022 偏頭痛預防性治療準則' },
  miga: { source: '台灣頭痛學會 2022 偏頭痛急性治療準則' },
  narc: { source: '猝睡症之臨床與衛教導讀（公開醫學文獻與指引彙編）', audience: '醫療人員與一般讀者（衛教導讀）' },
  pd:   { source: 'TMDS 2023 巴金森氏症治療共識' },
  phn:  { source: 'PHN 臨床導讀（Johnson & Rice NEJM 2014、NeuPSIG 指引）' },
  rls:  { source: 'RLS 臨床導讀（流行病學與診斷準則彙編）' },
  rmt:  { source: '鎮靜安眠藥理之臨床導讀' },
  se:   { source: 'Neurocritical Care Society 癲癇重積狀態指引' },
  thy:  { source: 'Lee & Pearce, Hyperthyroidism: A Review, JAMA 2023' },
  tn:   { source: '三叉神經痛分子機轉導讀（J Headache Pain 2026）' },
  tnk:  { source: '台灣腦中風學會 2026 TNK 共識' },
};

const css = `.md-foot{margin:26px 0 0}
.md-foot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.md-foot-item{background:#fff;border:1px solid #e0e8f5;border-left:4px solid #1565c0;border-radius:10px;padding:13px 16px}
.md-foot-k{font-size:9.5pt;font-weight:800;letter-spacing:.4px;color:#1565c0;margin-bottom:5px}
.md-foot-v{font-size:10.5pt;line-height:1.55;color:#46506a}
.md-foot-cta{display:inline-flex;align-items:center;gap:6px;margin-top:16px;padding:9px 18px;border-radius:22px;background:#0f2142;color:#fff;text-decoration:none;font-size:10.5pt;font-weight:700}
.md-foot-cta:hover{background:#1a3975}
.md-foot-note{margin-top:12px;font-size:9.5pt;color:#7a849c;line-height:1.6}
@media(max-width:680px){.md-foot-grid{grid-template-columns:1fr}}`;

function block(meta) {
  return `${START}
<section class="md-foot" aria-label="版本與訂閱">
  <div class="md-foot-grid">
    <div class="md-foot-item"><div class="md-foot-k">指引版本／來源</div><div class="md-foot-v">${meta.source}</div></div>
    <div class="md-foot-item"><div class="md-foot-k">最後更新</div><div class="md-foot-v">${UPDATED}</div></div>
    <div class="md-foot-item"><div class="md-foot-k">適用對象</div><div class="md-foot-v">${meta.audience || DEFAULT_AUDIENCE}</div></div>
  </div>
  <a class="md-foot-cta" href="${SUBSCRIBE}">訂閱臨床導讀更新 →</a>
  <p class="md-foot-note">本導讀為教育用途，不取代原始指引全文、最新仿單或個別臨床判斷。</p>
</section>
${END}`;
}

function prefixOf(file) {
  return file.replace(/\.html$/, '').replace(/\d+$/, '');
}

let changed = 0, skipped = 0;
for (const file of glob(root, /\.html$/)) {
  const meta = SERIES[prefixOf(file)];
  if (!meta) { skipped++; continue; }              // not a known series (index/dem/infographic)

  const filePath = path.join(root, file);
  let html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes('</main>')) { skipped++; continue; } // non-article layout

  const before = html;

  if (!html.includes('.md-foot{')) {
    html = html.replace('</style>', `${css}\n</style>`);
  }

  // strip any prior block, then re-insert before the pager (or before </main>).
  // Normalise leading whitespace at the anchor so the result is stable on re-run.
  html = html.replace(new RegExp(`\\n\\s*${START}[\\s\\S]*?${END}`), '');
  const anchorRe = html.includes('<nav class="pager">') ? /[ \t]*<nav class="pager">/ : /[ \t]*<\/main>/;
  html = html.replace(anchorRe, m => `${block(meta)}\n${m.trim()}`);

  if (html !== before) {
    fs.writeFileSync(filePath, html, 'utf8');
    changed++;
  }
}

console.log(`Enhanced ${changed} MD article footer(s); skipped ${skipped} non-series/non-article file(s).`);
