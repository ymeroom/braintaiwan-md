---
name: md-series
description: 全自動產生一個 BrainTaiwan MD 臨床導讀系列——異質多代理版：Codex 起草、Antigravity 審查、Fable 仲裁、claim-ledger 驗證閘門，通過才 build+commit+push。觸發：使用者輸入 /md-series 或要求「自動做一個 X 系列」。
---

# md-series v3：異質多代理臨床導讀產線

主控→執行→審查→仲裁：Fable（主會話）切工單與仲裁、`codex exec` 起草、`agy -p` 異質審查、
現有 claim-gate 對「仲裁後」文本查核。閘門在仲裁之後——Fable 的修正也要過查核。

## 參數
`/md-series --src <pdf...> --topic "<主題>" --n <篇數> [--dry-run] [--no-gate] [--no-hetero] [--prefix <前綴>]`
- `--src`、`--topic`、`--n`、`--prefix`、`--dry-run`、`--no-gate`：同 v2 語意不變
- `--no-hetero`：跳過 Codex/agy，全退回純 Claude 模式（v2 流程：呼叫 Workflow `md-series-pipeline`）

## 0. Preflight（--no-hetero 時跳過）
- `codex login status` 輸出須含 `Logged in`
- `agy -p "Reply with exactly one word: OK" </dev/null` 須回 OK
- 任一失敗 → 告知使用者，詢問改用 `--no-hetero` 或中止。**不得默默降級整條產線。**
- **stdin 規則（依 2026-07-03 煙霧測試結果，兩種呼叫不一致，不可套用同一條規則）**：
  - `codex exec` 起草呼叫、上面的 agy preflight ping，一律 `</dev/null` 關閉 stdin，否則掛住。
  - **例外：§4 的 `agy -p` 審查呼叫不可加 `</dev/null`**，必須改成把審查輸入檔內容整份透過
    stdin 管入（`< _review/<NN>-input.md`）。原因：agy 在無 `--dangerously-skip-permissions`
    時**無法自行讀本機檔案**——不是卡住，而是直接回覆「不知道目前工作目錄」並反問使用者要
    絕對路徑，於是永遠讀不到檔案、也不會輸出 JSON。這點已實測驗證（見煙霧測試結果檔變體 A vs B）。

## 1. Ingest
- 解析參數；`srcDir` 建議 `D:/claudecode/<prefix>-articles/`；確認來源 PDF 存在。
- `pdftotext` 轉出源文 txt。**已知瑕疵**：Lancet 風格 PDF 的小數點「·」常被吃成連字號
  （0.3–3.7% → 0–3% and 3–7%），數字類斷言查核前必須對照 PDF 人工核校 txt。

## 2. Plan（Fable，主會話）
- 讀源文 txt → 產 `series.json` 骨架（prefix/section/articles，欄位同 v2）。
- 每篇寫工單 `_tickets/<NN>-ticket.txt`：用 `lib/hetero.js` 的
  `buildDraftTicket({ briefMd, styleRulesMd, outFile })`。
  - `briefMd` 必含：範圍（涵蓋哪些源文段落）、必述事實（逐條附源文引文）、
    禁區（不得展開的相鄰主題）、長度與篇章結構。
  - `styleRulesMd`：注入「寫作風格禁忌」全文（不開場白、不呼籲行動、禁用詞清單、
    非咖啡廳閒聊語氣；摘要表＋🩺 小評論＋免責聲明必備）。

## 3. Draft（codex exec，可並行）
每篇（cwd = srcDir）：

```bash
codex exec --skip-git-repo-check -s workspace-write "讀取本目錄的 _tickets/<NN>-ticket.txt，依工單內容執行。" </dev/null
```

- **必須加 `-s workspace-write`**（或等效允許寫入的 sandbox 設定）。原因：codex exec 預設
  sandbox 是 `read-only`，且 `approval: never` 不會跳出核准提示，缺這個旗標時 codex 雖能正確
  讀工單、正確產出草稿內容，但寫檔一律被 `apply patch` 拒絕（`writing is blocked by read-only
  sandbox`），輸出檔案不會建立。這點已實測驗證（煙霧測試變體 A 失敗、A2 加旗標後成功）。
- `--skip-git-repo-check` 本身沒有問題，維持不變。
- stdin 仍須關閉（`</dev/null`），否則會卡住等待輸入。
- 完成檢查：`<NN>.md` 存在、非空、含 frontmatter。不合格重試 1 次。
- 連敗 2 次 → **Fable 親自起草該篇**，並於最終報告標記「該篇為 Claude 起草」。

## 4. Review（agy，可並行）
每篇：
1. 用 `buildReviewPrompt({ draftMd, briefMd, sourceExcerpt, styleRulesMd })` 產 `_review/<NN>-input.md`（`styleRulesMd` 傳與 §2 `buildDraftTicket` 相同的「寫作風格禁忌」全文，讓 agy 有依據可查風格違規，不可省略）。
2. 呼叫（模板逐字取自煙霧測試結果檔，非 stdin 管入的「讀取 X 檔」寫法**已實測失敗，不可使用**）：

   ```bash
   agy -p "依 stdin 內容中的指示輸出 JSON。" < _review/<NN>-input.md > _review/<NN>-raw.txt
   ```

   建議包一層逾時保護：

   ```bash
   timeout 240 agy -p "依 stdin 內容中的指示輸出 JSON。" < _review/<NN>-input.md > _review/<NN>-raw.txt
   ```

   - `_review/<NN>-input.md` 為 `buildReviewPrompt()` 產出的審查提示全文（已內含 JSON 輸出契約、
     工單、源文摘錄、草稿全文），整份當 stdin 灌入，**不是**在 `-p` 字串裡叫 agy 去讀這個檔案。
   - 這是唯一允許不加 `</dev/null` 的呼叫型式——檔案本身就是 stdin，agy 無法自行讀本機路徑
     （見 §0 stdin 規則例外說明），只能靠 stdin 拿到待審內容。
   - stdout（純 JSON，無多餘文字）仍照原設計導向 `_review/<NN>-raw.txt`。
3. `parseReviewIssues(raw)`（讀 `_review/<NN>-raw.txt`）解析 → 成功則存 `_review/<NN>-issues.json`。
4. 解析回 null → 重試 1 次（仍走 stdin 管入同一份輸入檔，prompt 追加 REVIEW_JSON_CONTRACT 強調只輸出 JSON）。
5. 連敗 2 次 → 該篇標記「⚠ 未經異質審查」記入最終報告，不擋流程。

## 5. Arbitrate（Fable，主會話）
- 逐條 issue 判定 ACCEPT / REJECT ＋ 一句理由。準繩：源文為最高權威；
  風格類以「寫作風格禁忌」為準；suggestion 僅供參考，修法由 Fable 自定。
- ACCEPT → Fable 直接編輯該篇 `.md` 套用修正（不回 Codex，只一輪）。
- 全程寫 `_review-ledger.md`：每條 issue｜判定｜理由｜實際修改摘要。

## 6. Verify + Gate（現有機制，對「仲裁後」文本）
- 每篇派一個 Claude 子代理：讀最終 `.md` ＋ 源文 txt → 抽 claim ledger
  （`{ sentence, claimType, value, classification, sourceQuote }`，欄位同 v2）→
  寫 `_ledgers/<NN>.json`。
- 閘門（決定論）：`evaluateGate(ledgers, { noGate })`（`lib/gate.js`，不動）。
- 報告：`renderReport(ledgers, gate)` → `_verification-report.md`（無論過不過都寫）。
- `gate.pass === false` → **停**：不 build、不 commit/push，回報阻擋摘要。

## 7. Assemble + Publish（同 v2 不變）
- `node build.js <srcDir>/series.json` → 結構驗證（`validateDetailsBalance`）→
  （除非 --dry-run）git add／commit／push。commit 訊息同 v2 規則；
  --no-gate 時前綴「⚠ 未經驗證：」。

## 稽核產物
| 檔案 | 內容 |
|---|---|
| `_tickets/NN-ticket.txt` | 低熵工單 |
| `_review/NN-input.md` / `NN-raw.txt` / `NN-issues.json` | 審查輸入（透過 stdin 灌給 agy）／原始輸出／解析後意見 |
| `_review-ledger.md` | 仲裁帳本（issue｜判定｜理由｜修改） |
| `_ledgers/NN.json`、`_verification-report.md` | claim ledger 與閘門報告 |

## 失敗行為
| 失敗點 | 行為 |
|---|---|
| preflight 不過 | 詢問 --no-hetero 或中止，不默默降級 |
| codex 起草連敗 2 次 | Fable 代打該篇，報告標記 |
| agy 審查連敗 2 次 | 該篇「⚠ 未經異質審查」，不擋流程 |
| Gate 未過 | 不 build、不 push，留全部稽核產物 |
| build／結構驗證／push 失敗 | 同 v2：不繼續，回報具體失敗點 |

## 醫療安全但書
驗證閘門只查「數字是否與源文相符」；異質審查補「語境與風格」層但只審一輪。
即使全過也產出報告與仲裁帳本供抽查。`--no-gate` 僅在明確知情時使用。
