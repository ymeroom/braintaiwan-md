# 設計：md-series 異質多代理升級（v3）

**日期**：2026-07-03
**狀態**：草案（待用戶審閱）
**範圍**：braintaiwan-md repo（`SKILL.md`、新增 `lib/hetero.js`）；不動 `build.js`、`lib/gate.js`、`lib/report.js`、`lib/apply-index.js`、既有 Workflow
**前情**：疊在 2026-06-21 全自動產線設計（Phase 1+2）之上

---

## 1. 目標

把 /md-series 的 LLM 階段異質化，形成「主控→執行→審查→仲裁」流水線：

- **Fable 5**（Claude 主 session）＝ Tech Lead：規劃、切低熵工單、仲裁審查意見、直接套用修正
- **Codex gpt-5.5**（`codex exec`）＝ Executor：照工單起草，只寫指定檔案
- **Antigravity**（`agy -p`）＝ 異質 Reviewer：審臨床邏輯語境、寫作風格、結構完整性
- 現有 claim-ledger 驗證閘門與 build/publish 機制完全沿用

動機：不同模型家族盲點分布不同；全 Claude 產線中，起草者與查核者同家族，同款幻覺可能互相放行。三家族交叉是現有產線唯一補不到的維度。

## 2. 非目標（YAGNI）

- 不做「修→再審」多輪迴圈：只審一輪，仲裁後 Fable 直接小修，不回 Codex（用戶已定案）。
- 不做通用 CLI 代理呼叫層；呼叫規範直接寫在 SKILL.md 指令模板。
- 不動 Phase 1 機械層與 claim-gate。
- 不接原生 `gemini` CLI——實測其免費層已被 Google 停用（IneligibleTierError，2026-07-03），異質審查一律走 `agy`。

## 3. 環境事實（2026-07-03 實測）

| CLI | 版本 | 狀態 | 呼叫要領 |
|---|---|---|---|
| `claude` | 2.1.199 | 主 session 本身 | — |
| `codex` | 0.142.5 | 已登入（ChatGPT），模型 gpt-5.5 | `codex exec --skip-git-repo-check "<prompt>" </dev/null`；**stdin 不關會掛住** |
| `agy` | 1.0.16 | 可用，`-p` 乾淨回傳 | `agy -p "<prompt>" </dev/null`；同樣要關 stdin |
| `gemini` | 0.47.0 | **不可用**（免費層停用） | 排除 |

## 4. 流程（升級後）

```
PDF ─Ingest(pdftotext，注意小數點連字號瑕疵)─▶ 源文 txt
    ─Plan(Fable，主 session)───▶ series.json 骨架 + _tickets/NN-brief.md
    ─Draft(codex exec ×N，並行)─▶ <srcDir>/<NN>.md（Codex 直接落盤）
    ─Review(agy -p ×N，並行)───▶ _review/NN-issues.json
    ─Arbitrate(Fable，主 session)─▶ 逐條 ACCEPT/REJECT；ACCEPT 者直接修 .md
                                   全程記 _review-ledger.md
    ─Verify+Gate(現有，不動)────▶ 對「仲裁後」文本跑 claim ledger → gate
    ─Assemble+Publish(現有，不動)▶ build.js → 結構驗證 → commit/push
```

順序關鍵：**claim-gate 在仲裁之後**——Fable 的修正也可能引入新錯，閘門必須查最終文本。

## 5. 各階段規格

### 5.1 Plan → 低熵工單

每篇一份 `_tickets/<NN>-brief.md`，內含：

1. **範圍**：本篇涵蓋的源文段落（含段落索引）
2. **必述事實**：逐條列出，附源文引文（供 Codex 引用、供 Review/Verify 溯源）
3. **禁區**：不得展開的相鄰主題（防越界重工）
4. **風格規則**：注入「寫作風格禁忌」全文（不開場白、不條列成癮、不呼籲行動、禁用詞清單、非咖啡廳閒聊語氣）
5. **輸出契約**：目標檔名、frontmatter 欄位、摘要表＋🩺 小評論＋免責聲明段落必備

### 5.2 Draft（Codex）

- 呼叫：cwd 設在 `srcDir`，`codex exec --skip-git-repo-check "<工單全文>" </dev/null`，背景並行 N 篇
- Codex 以其 workspace-write sandbox 直接寫 `<NN>.md`
- 完成檢查：檔案存在、非空、含 frontmatter；不合格重試 1 次
- **降級**：連敗 2 次 → Fable 主 session 親自起草該篇（記入報告「該篇為 Claude 起草」）

### 5.3 Review（Antigravity）

- 呼叫：`agy -p "<review prompt>" </dev/null`，背景並行
- 草稿全文＋工單＋相關源文段落**內嵌 prompt**——不給檔案存取＝天然唯讀 reviewer
- 審三面向：(a) 臨床邏輯與語境（數字對但用錯地方、量詞轄域、適應症張冠李戴）(b) 寫作風格禁忌 (c) 結構與完整性（必述事實有無漏、必備段落齊不齊）
- 輸出契約：只輸出 JSON 陣列 `[{quote, type: clinical|style|structure, severity: high|low, description, suggestion}]`
- 解析失敗重試 1 次（加「只輸出 JSON」強調）；**降級**：連敗 2 次 → 該篇標記「⚠ 未經異質審查」記入報告，不擋流程

### 5.4 Arbitrate（Fable，本設計的核心價值）

- 逐條 issue 判定：ACCEPT（真問題）或 REJECT（假陽性/風格品味不合本站）＋一句理由
- ACCEPT 者由 Fable 直接編輯 `.md` 套用修正（不回 Codex）
- 全程寫 `_review-ledger.md`：每條 issue｜判定｜理由｜實際修改摘要——「Tech Lead 擋幻覺」的可稽核證據
- 仲裁準繩：源文為最高權威；風格類以「寫作風格禁忌」為準；suggestion 僅供參考，修法由 Fable 自定

### 5.5 Preflight 與逃生門

- 跑流程前檢查：`codex login status` 回「Logged in」；`agy -p "OK"` 能回
- 任一不可用 → 明確告知並詢問是否 `--no-hetero`（全退回現行純 Claude 模式，其餘流程照舊）
- 新 flag：`--no-hetero`；既有 `--dry-run`、`--no-gate` 語意不變

## 6. 稽核產物

| 檔案 | 內容 | 產生者 |
|---|---|---|
| `_tickets/NN-brief.md` | 低熵工單 | Plan（Fable） |
| `_review/NN-issues.json` | 原始審查意見 | Review（agy） |
| `_review-ledger.md` | 仲裁帳本（issue｜判定｜理由｜修改） | Arbitrate（Fable） |
| `_verification-report.md` | claim ledger 報告（現有） | Verify/Gate |

## 7. 元件邊界

| 元件 | 職責 | 變動 |
|---|---|---|
| `SKILL.md`（md-series） | 新三階段流程、CLI 指令模板、preflight、降級規則 | 修改 |
| `lib/hetero.js` | 純函式：`buildDraftTicket()`、`buildReviewPrompt()`、`parseReviewIssues()`（容錯 JSON 解析） | 新增 |
| `test/hetero.test.js` | 上述純函式測試 | 新增 |
| `build.js` / `lib/gate.js` / `lib/report.js` / `lib/apply-index.js` | — | 不動 |

## 8. 失敗行為

| 失敗點 | 行為 |
|---|---|
| Codex 起草失敗 ×2 | Fable 代打該篇，報告標記 |
| agy 審查失敗 ×2 | 該篇「⚠ 未經異質審查」，不擋流程 |
| 仲裁後 Gate 未過 | 同現行：不 build、不 push、留報告 |
| preflight 不過 | 詢問 `--no-hetero` 或中止 |
| 其餘 | 同 2026-06-21 設計不變 |

## 9. 測試策略

- `parseReviewIssues()` 單元測試：正常 JSON、程式碼圍欄包裹、前後雜訊、非法 JSON（應回 null 觸發重試）、空陣列
- 端到端：小系列 `--dry-run` 煙霧測試（真呼叫 codex/agy 各至少 1 次）
- 沿用注入錯誤測試：故意讓源文某數字與草稿不符，確認 claim-gate 仍擋

## 10. 已知風險與但書

- Codex/agy 為外部服務，額度與可用性不受控；降級路徑保證產線不因單一 CLI 斷線而癱瘓
- agy 審查意見品質未經大規模驗證；第一個真實系列跑完後應人工抽查 `_review-ledger.md`，校準仲裁準繩
- 只審一輪＝Fable 修正後的文字無人再異質複審；已以「claim-gate 置於仲裁後」補償數字類風險，語境類殘餘風險與現行產線相同
- token/費用：Codex 走 ChatGPT 訂閱、agy 走 Google 帳號、Fable 走本 session——三邊各自計費，單系列成本待首跑實測
