export const meta = {
  name: 'md-series-pipeline',
  description: '讀來源產出 N 篇 BrainTaiwan MD 導讀草稿並逐篇做 claim-ledger 驗證',
  phases: [
    { title: 'Plan', detail: '規劃 N 篇與來源對應' },
    { title: 'Draft', detail: '每篇一個 agent 起草' },
    { title: 'Verify', detail: '每篇一個 agent 建 claim ledger' },
  ],
};

const LEDGER_SCHEMA = {
  type: 'object',
  required: ['article', 'claims'],
  properties: {
    article: { type: 'string' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sentence', 'claimType', 'value', 'classification', 'sourceQuote'],
        properties: {
          sentence: { type: 'string' },
          claimType: { type: 'string', enum: ['dose','percent','cutoff','criterion','epidemiology','drugName','other'] },
          value: { type: 'string' },
          classification: { type: 'string', enum: ['SUPPORTED','NOT_FOUND','CONTRADICTED'] },
          sourceQuote: { type: 'string' },
        },
      },
    },
  },
};

const PLAN_SCHEMA = {
  type: 'object',
  required: ['series', 'briefs'],
  properties: {
    series: { type: 'object' },           // series.json 骨架（prefix/section/articles…）
    briefs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['md', 'out', 'nav', 'sourceFocus'],
        properties: {
          md: { type: 'string' }, out: { type: 'string' }, nav: { type: 'string' },
          sourceFocus: { type: 'string' },  // 本篇要涵蓋的來源段落/重點
        },
      },
    },
  },
};

const _args = typeof args === 'string' ? JSON.parse(args) : (args || {});
const { srcPaths, topic, n, prefix } = _args;
const srcList = srcPaths.join(', ');

phase('Plan');
const plan = await agent(
  `你在規劃一個 BrainTaiwan MD 臨床導讀系列。主題：「${topic}」，共 ${n} 篇，檔名前綴 ${prefix}。` +
  `請用 Read 工具讀這些來源 PDF：${srcList}。` +
  `產出 series.json 骨架（prefix、seriesTag、section{labelZh,labelEn,count,color:"auto",divider,sourceNote,metaKeyword}、` +
  `articles[]，每篇含 md/out/nav/card{cat,title,desc,tags(剛好2個)}），以及每篇 brief（md/out/nav/sourceFocus）。` +
  `風格遵守 BrainTaiwan 寫作規則：費曼語氣、不寫前言、不呼籲行動、避免 AI 塑膠詞。`,
  { schema: PLAN_SCHEMA, label: 'plan' }
);

phase('Draft');
const drafted = (await parallel(plan.briefs.map(brief => () =>
  agent(
    `撰寫第「${brief.nav}」篇 markdown（檔名 ${brief.md}）。系列主題：${topic}。本篇重點：${brief.sourceFocus}。` +
    `用 Read 工具讀來源 PDF（${srcList}）取材。只輸出 markdown 全文，不要任何說明或前後綴。` +
    `嚴格遵守 BrainTaiwan 寫作規則：費曼咖啡廳語氣、第一句直接切入核心、不寫前言開場白、不用條列開場、` +
    `結尾停在一個觀察或未解問題、不呼籲讀者行動、避免禁用詞；保留 frontmatter＋臨床要點摘要表＋🩺 施懿恩小評論＋免責聲明。`,
    { label: `draft:${brief.out}`, phase: 'Draft' }
  ).then(content => ({ md: brief.md, out: brief.out, nav: brief.nav, content }))
))).filter(Boolean);

phase('Verify');
const ledgers = (await parallel(drafted.map(d => () =>
  agent(
    `你是嚴格的查核者。用 Read 工具重讀來源 PDF（${srcList}）逐條查核下面這篇草稿。` +
    `把每一個可查核斷言（數字、劑量、百分比、切點、診斷準則、藥名、流病數據）抽成一條 claim：` +
    `classification 標 SUPPORTED（源文支持，附 sourceQuote）／NOT_FOUND（源文找不到）／CONTRADICTED（與源文矛盾，附 sourceQuote）；` +
    `claimType 從列舉選；value 填斷言中的數值或關鍵詞。寧可多抽，不要漏掉任何數字。草稿全文：\n\n${d.content}`,
    { label: `verify:${d.out}`, phase: 'Verify', schema: LEDGER_SCHEMA }
  ).then(lg => ({ ...lg, article: d.out }))
))).filter(Boolean);

return {
  series: plan.series,
  drafts: drafted.map(d => ({ md: d.md, content: d.content })),
  ledgers,
};
