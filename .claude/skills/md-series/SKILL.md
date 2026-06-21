---
name: md-series
description: 全自動產生一個 BrainTaiwan MD 臨床導讀系列——讀來源 PDF、多代理起草、claim-ledger 驗證閘門、通過才 build+commit+push。觸發：使用者輸入 /md-series 或要求「自動做一個 X 系列」。
---

# md-series：全自動臨床導讀產線

## 參數
`/md-series --src <pdf...> --topic "<主題>" --n <篇數> [--dry-run] [--no-gate] [--prefix <前綴>]`
- `--src`：一或多個來源 PDF 絕對路徑（必填）
- `--topic`、`--n`：主題與篇數（必填）
- `--prefix`：檔名前綴（未給則由主題推一個短英文前綴，與既有系列不衝突）
- `--dry-run`：跑到 build 為止，**不 commit/不 push**
- `--no-gate`：跳過驗證閘門（報告與 commit 訊息標記「⚠ 未經驗證」）
- 預設為全自動含 push；要保守請加 --dry-run（跑到 build 為止，不 commit/不 push）。

## 流程（嚴格依序）

1. 解析參數；決定 `srcDir`（建議 `D:/claudecode/<prefix>-articles/`）。確認來源 PDF 存在。

2. 呼叫 Workflow：
   `Workflow({ name: 'md-series-pipeline', args: { srcPaths, topic, n, prefix } })`
   等待回傳 `{ series, drafts, ledgers }`。

3. 閘門評估（決定論，主會話）：
   - `const { evaluateGate } = require('<repo>/lib/gate')`（用 Bash `node -e` 或直接在會話以 node 執行）
   - `const gate = evaluateGate(ledgers, { noGate: <--no-gate> })`

4. 寫報告：`const md = require('<repo>/lib/report').renderReport(ledgers, gate)` → 寫到 `<srcDir>/_verification-report.md`（無論通過與否皆寫，供抽查）。

5. **閘門判定**：
   - 若 `gate.pass === false`：**停**。不寫草稿正文、不 build、不 commit/push。回報阻擋摘要 + 報告路徑。結束。（--no-gate 時 gate.pass 已為 true，不會進此分支；但報告與 commit 會標記未經驗證。）
   - 若 `gate.pass === true`：續。

6. 寫檔：把 `drafts` 各篇 `content` 寫到 `<srcDir>/<md>`；把 `series`（已含 srcDir/outDir/byline 等；若缺由 skill 補齊）寫到 `<srcDir>/series.json`。

7. Build：`node build.js <srcDir>/series.json`（會渲染頁面 + 套用 index 區塊；`loadSeries` 內 `assertSeriesShape` 會擋掉壞 series.json）。確認 0 退出碼。

8. 結構驗證：`node -e "const{validateDetailsBalance}=require('./lib/apply-index');const fs=require('fs');const r=validateDetailsBalance(fs.readFileSync('index.html','utf8'));if(!r.balanced)process.exit(1)"`。不平衡 → 停、不 push、回報。

9. 發佈（除非 --dry-run）：
   - commit 訊息：`新增 <topic> 臨床導讀 <n> 篇（<prefix>）`；--no-gate 時前綴 `⚠ 未經驗證：`。
   - `git add <out 頁面> index.html`（series.json 與草稿在 srcDir，視是否同 repo 決定是否納入）→ `git commit` → `git push origin main`。
   - --dry-run：到第 8 步為止，回報「已 build、未 push」。

## 失敗行為
任何一步失敗（閘門未過、build 非 0、結構不平衡、push 失敗）→ **不繼續 push**，保留草稿與 `_verification-report.md`，回報具體失敗點。

## 醫療安全但書
驗證閘門只查「數字是否與源文相符」，無法判斷語境正確性。即使通過也產出報告供抽查。`--no-gate` 僅在明確知情時使用。
