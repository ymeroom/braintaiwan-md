# 設計：BrainTaiwan MD 臨床導讀文章全自動產線

**日期**：2026-06-21
**狀態**：已核可（待寫實作計畫）
**範圍**：braintaiwan-md repo（`build.js`、`index.html`）＋ 來源文章目錄（`D:\claudecode\<series>-articles\`）＋ skill `md-series`

---

## 1. 目標

把目前手工的臨床導讀產線——讀 PDF → 規劃 N 篇 → 逐篇寫 markdown → 複製改 build 腳本 → 手插 index.html → commit/push——收斂成**一個指令跑完**的全自動流程，含自動 push，但內建臨床數字驗證閘門以降低（非消滅）醫療正確性風險。

使用者體感：在 Claude 會話打一個指令，全程零手動，產出已上線的系列；若驗證未過則自動中止 push 並回報。

## 2. 非目標（YAGNI）

- 不做無人值守 cron/headless（已評估的 B 案，本版不做）。
- 不重寫既有 22 支 `build-*.js`（保留不動，新系列走新路徑）。
- 不做圖卡/FB/media 串接（另案）。
- 驗證閘門不追求「醫學審稿等級」正確性，只做「對源文交叉查核」這一層機械防線。

## 3. 架構總覽

兩階段，Phase 2 疊在 Phase 1 上（Phase 2 最後兩步即呼叫 Phase 1）。

```
Phase 2（內容＋安全）
  /md-series → Workflow: Plan → Draft(fan-out) → Verify(fan-out) → Gate → Assemble → Publish
                                                                      │
                                                                      ▼ 呼叫
Phase 1（機械，零 LLM）：  series.json → build.js → *.html ＋ index 區塊（自動選色、結構驗證）
```

---

## 4. Phase 1 — 設定驅動產生器（零 LLM、零臨床風險）

### 4.1 `series.json`（一系列一份，置於來源目錄）

```json
{
  "prefix": "cidp",
  "seriesTag": "CIDP 慢性發炎性脫髓鞘多發性神經根神經病臨床導讀",
  "srcDir": "D:/claudecode/cidp-articles",
  "outDir": "D:/claudecode/braintaiwan-md",
  "byline": "施懿恩 醫師．神經內科 · 導讀整理 2026 年",
  "section": {
    "labelZh": "周邊神經",
    "labelEn": "Peripheral Nerve",
    "count": "CIDP 導讀 · 10 篇",
    "color": "auto",
    "divider": "EAN/PNS 2021 指引 · van Doorn 2024 · Kiers 2025",
    "sourceNote": "Van den Bergh PYK, et al. J Peripher Nerv Syst 2021;26:242-268；van Doorn IN, et al. Ther Clin Risk Manag 2024;20:111-126；Kiers L, Cruse B. BMJ Neurol Open 2025;7:e001318",
    "metaKeyword": "周邊神經（CIDP）"
  },
  "articles": [
    {
      "md": "01-what-is-cidp.md",
      "out": "cidp01.html",
      "nav": "① 認識 CIDP",
      "card": {
        "cat": "導讀 ①",
        "title": "認識 CIDP：被慢慢剝外皮的電線",
        "desc": "病名拆解、免疫攻擊髓鞘的機轉、軸突損傷不可逆的時間壓力……",
        "tags": ["疾病概念", "免疫機轉"]
      }
    }
  ]
}
```

欄位語意：`color: "auto"` 由產生器挑未用過的 `d-*`；指定字串（如 `"green"`）則直接用。`articles[].md` 對應 `srcDir` 下的 markdown 檔。

### 4.2 `build.js`（通用版，取代逐系列腳本）

- 用法：`node build.js <path/to/series.json>`。
- 行為：沿用既有極簡 markdown 轉換器（自 `build-phn.js` 抽出為共用模組 `lib/md-render.js`），讀 `series.json` → 對每篇產 `<prefix>NN.html`（frontmatter 解析、首 H1 移除、og:description 取首段引言，與現行一致）。
- 接著呼叫 index 插入步驟（4.3）。
- 既有 22 支 `build-*.js` 不動；新系列只需一份 `series.json`。

### 4.3 index.html 自動插入（`lib/apply-index.js`）

- **標記**：區塊以 `<!-- SERIES:<prefix> START -->` 與 `<!-- SERIES:<prefix> END -->` 包覆。
- **首次**：無標記時，在 `</main>` 前插入完整 `<details class="topic">…</details>`（含標記）。
- **重跑**：標記已存在時，**就地替換**標記之間的內容（idempotent，不重複插）。
- **自動選色**（`color: "auto"`）：掃描 `index.html` 全部 `d-*` 使用次數，從 8 色盤（amber/blue/coral/green/indigo/purple/red/teal）選**尚未被任何區塊用過**者；若皆已用，選**使用次數最少**者。dot/banner/tag 三者同色。
- **meta description**：若 `section.metaKeyword` 尚未出現在 `<meta name="description">`，則插入到既有清單中。
- **結構驗證（硬性）**：插入後計算 `<details class="topic">` 與對應 `</details>` 數量；**不相等即中止並還原**，不寫出壞掉的 index。

### 4.4 冪等性與可測性

- 同一 `series.json` 重跑：HTML 與 index 區塊輸出穩定一致。
- 黃金測試：以 `cidp/series.json` 重建 → 與目前 committed 的 `cidp01–10.html` 應逐位元組相符（建立基準後）；index 插入跑兩次結果相同。

---

## 5. Phase 2 — 全自動產線（內容＋安全層）

### 5.1 觸發介面：skill `md-series`

```
/md-series --src <pdf...> --topic "<主題>" --n <篇數> [--audience MD] [--dry-run] [--no-gate]
```

- `--src`：一或多個來源 PDF 路徑。
- `--topic`、`--n`：主題與篇數。
- `--dry-run`：跑到 Assemble 為止，**不 commit/不 push**（給想先看的時候）。
- `--no-gate`：跳過驗證閘門（**逃生門**，預設關閉；使用時於報告與 commit 訊息明確標記「未經驗證」）。
- 預設：全自動含 push。

### 5.2 Workflow 階段

| 階段 | 形式 | 產出 |
|------|------|------|
| 0. Ingest | 腳本/agent 讀 PDF → 純文字 | 各來源的可搜尋文字 + 段落索引 |
| 1. Plan | 1 agent | `series.json` 骨架（prefix/section/articles 列）＋ 每篇 brief（涵蓋哪些來源段落與必述事實） |
| 2. Draft | fan-out，1 agent/篇 | 每篇 markdown（費曼語調、遵守 `feedback_writing-style`：不開場白、不呼籲行動、避禁用詞、保留摘要表＋🩺 小評論＋免責） |
| 3. Verify | fan-out，1 agent/篇 | 每篇 claim ledger ＋ 逐條判定（見 5.3） |
| 4. Gate | 決定論（workflow JS） | 通過 → 續；未過 → 停、寫報告、不 build/push |
| 5. Assemble | 腳本 | 寫 .md → 跑 Phase 1 `build.js` → 結構驗證 |
| 6. Publish | 腳本 | git add/commit/push（訊息自動生成；`--dry-run` 則略過） |

並行性：Draft 與 Verify 以 `pipeline()` 串接（每篇起草完即進驗證，不等其他篇），但 **Gate 為 barrier**——需蒐集全部判定後才決定（系列原子性，見 5.4）。

### 5.3 驗證閘門（安全核心）

**claim ledger**：每篇 verifier agent 抽出所有「可查核斷言」，逐條結構化：

```
{ sentence, claimType, value, classification, sourceQuote }
```

- `claimType` ∈ {dose, percent, cutoff, criterion, epidemiology, drugName, other}
- `classification` ∈ {SUPPORTED, NOT_FOUND, CONTRADICTED}，附源文佐證引文（SUPPORTED/CONTRADICTED 必附）。

**高風險類別**：dose / percent / cutoff / criterion（例：1.0 mV、0.6 g/L、7000 BTU、≥50% 潛時延長）。

**阻擋規則**：
- 任一 **CONTRADICTED** → 硬擋。
- 高風險類別 **NOT_FOUND** → 硬擋。
- 低風險（一般敘述）NOT_FOUND → 記入報告但不擋。

**原子性**：任一篇觸發阻擋 → **整個系列不 push**（8/10 過也不放行），所有草稿與報告保留供修正。

**誠實但書**：本閘門只查「數字是否與源文相符」，無法判斷語境是否正確（數字對、用錯地方仍可能漏網）。因此**即使全過也產出報告**，供使用者選擇性人工瞄一眼。它降低、不消滅醫療正確性風險。

### 5.4 失敗行為

| 失敗點 | 行為 |
|--------|------|
| Gate 未過 | 不 build、不 push；報告寫到 `<srcDir>/_verification-report.md`；草稿留工作目錄、不 commit；回報摘要 |
| build/結構驗證失敗 | 不 push；保留已寫出的草稿與半成品 HTML；回報 |
| git push 失敗（網路/權限） | 本地 commit 已存在；回報需手動 `git push`；不重試破壞性操作 |
| `--no-gate` 使用 | 照常 build/push，但報告與 commit 訊息標記「⚠ 未經驗證」 |

報告格式：每篇一張 markdown 表（句子｜類別｜判定｜源文佐證），阻擋項置頂。

---

## 6. 資料流

```
PDF ──Ingest──▶ 文字+索引
   ──Plan────▶ series.json 骨架 + 每篇 brief
   ──Draft───▶ <NN>.md
   ──Verify──▶ ledger + 判定 + 報告
   ──Gate────▶ 通過? ──否──▶ 寫報告、停
                       └─是──▶ build.js ▶ *.html + index 區塊 ▶ commit/push
```

每個閘門都產出可稽核的報告 artifact。

## 7. 元件邊界（單一職責）

| 元件 | 職責 | 依賴 |
|------|------|------|
| `lib/md-render.js` | markdown→HTML（純函式） | 無 |
| `build.js` | series.json → 頁面 + 觸發 index 插入 | md-render、apply-index |
| `lib/apply-index.js` | index 區塊插入/更新、選色、結構驗證 | 無 |
| `md-series`（skill） | 觸發與參數解析、啟動 workflow | workflow |
| workflow `md-series-pipeline` | 編排 Plan→Draft→Verify→Gate→Assemble→Publish | build.js、git |

每個元件可獨立理解與測試；Phase 1 三件（render/build/apply-index）完全不碰 LLM。

## 8. 測試策略

- **Phase 1**：純決定論。黃金測試（cidp 重建逐位元組相符）、index 冪等測試、結構驗證測試（餵入不平衡 index 應中止）、選色測試（已用色不重選）。
- **Phase 2**：`--dry-run` 端到端煙霧測試；**注入錯誤測試**——準備一份故意把某數字改錯的來源，確認 Gate 阻擋且不 push；正常來源確認可通過並產報告。

## 9. 蓋的順序

1. Phase 1（`lib/md-render.js`、`build.js`、`lib/apply-index.js`）——立即可用，把機械 80% 去風險。
2. Phase 2（skill＋workflow＋驗證閘門＋publish 編排）——疊上去。

各階段獨立可交付；Phase 1 完成即可手動用 `series.json` 取代逐系列腳本。

## 10. 已知風險與但書

- 驗證閘門無法擋「數字對但語境錯」；故保留報告供人工抽查，並建議高風險系列發佈後仍人工複核關鍵表。
- 全自動 push 醫療內容本質有風險；`--dry-run` 為預設保守用法，`--no-gate` 僅供明確知情時使用。
- Workflow 多代理起草品質受來源 PDF 文字抽取品質影響；Ingest 階段需保留段落索引以利 Verify 溯源。
