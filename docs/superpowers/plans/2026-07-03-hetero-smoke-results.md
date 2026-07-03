# Task 3：codex / agy 真實 CLI 煙霧測試結果

日期：2026-07-03　環境：Windows 11 + Git Bash，`codex` v0.142.5（model gpt-5.5），`agy`（本機安裝於 `/c/Users/ymero/AppData/Local/agy/bin/agy`）

測試素材：用 `lib/hetero.js` 的 `buildDraftTicket` / `buildReviewPrompt` 產生 `ticket.txt`（工單）與 `review-input.md`（審查輸入，約 2153 bytes），置於 scratchpad `smoke/` 目錄。所有指令均在 `smoke/` 目錄內執行，且都用 `</dev/null` 關閉 stdin（Variant B 例外，故意把檔案接到 stdin）。

## 1. codex exec 起草（讀工單檔寫目標檔）

### 變體 A：`--skip-git-repo-check`（無 `-s` 旗標，預設 sandbox）—— 失敗

```bash
codex exec --skip-git-repo-check "讀取本目錄的 ticket.txt，依工單內容執行。" </dev/null
```

- 結果：**FAIL**（`test -s smoke-draft.md` → `DRAFT-FAIL`）
- 原因：codex 正確讀到 `ticket.txt`（PowerShell `Get-Content` 讀檔成功），也正確產出草稿內容，但寫檔被 sandbox 擋下：
  ```
  ERROR codex_core::tools::router: error=patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings
  codex
  無法建立 `smoke-draft.md`：目前工作區為唯讀，且不允許申請寫入權限。
  ```
  預設 sandbox 是 `read-only`，`approval: never` 又不會跳出核准提示，於是寫入永遠被拒。

### 變體 A2：加 `-s workspace-write` —— **成功**

```bash
codex exec --skip-git-repo-check -s workspace-write "讀取本目錄的 ticket.txt，依工單內容執行。" </dev/null
```

- 結果：**SUCCESS**（`DRAFT-OK`）
- 輸出摘要：banner 顯示 `sandbox: workspace-write [workdir, /tmp, $TMPDIR]`；codex 讀檔、產生兩段繁中草稿、透過 `apply patch` 直接寫入 `smoke-draft.md`。
- 檔案內容核對：`smoke-draft.md` 確實含「100 mg」（`grep -c "100 mg"` → `1`），且完整保留源文引文「aspirin 100 mg daily」，未談禁區主題（抗凝血劑）。
- 因為 A2 已成功，未再測試 brief 中提到的 fallback（把工單全文直接當 prompt 參數）。

**結論**：codex exec 讀檔起草可行，但**必須加 `-s workspace-write`**（或等效的允許寫入 sandbox 設定），否則預設 read-only sandbox 會讓 apply patch 一律被拒。`--skip-git-repo-check` 本身沒有問題，是原 brief 假設遺漏的旗標。

## 2. agy 審查（讀 review-input.md 輸出 JSON）

### 變體 A：讀檔（`-p` + 檔名，`</dev/null`）—— 失敗

```bash
timeout 180 agy -p "讀取本目錄的 review-input.md，依其中指示輸出 JSON。" </dev/null
```

- 結果：**FAIL**（未卡死／未逾時，但沒有讀到檔案，也沒有輸出 JSON）
- 實際輸出：
  ```
  抱歉，由於系統限制，我無法直接得知您執行指令時所在的「當前目錄」（Current Working Directory）。
  能否請您提供 review-input.md 的完整絕對路徑，或者告訴我您目前所在的資料夾路徑？
  ```
  agy 在無 `--dangerously-skip-permissions` 時，不會（或不能）自行解析出目前工作目錄去讀檔，也沒有嘗試呼叫讀檔工具，直接回覆要求提供絕對路徑。未觀察到權限提示卡住的情形，是模型判斷「不知道自己在哪」而放棄讀檔。

### 變體 B：stdin 管入內容（唯一允許不加 `</dev/null` 的變體）—— **成功**

```bash
agy -p "依 stdin 內容中的指示輸出 JSON。" < review-input.md
```

- 結果：**SUCCESS**
- 實際輸出（stdout，逐字）：
  ```json
  [
    {
      "quote": "阿斯匹靈在臨床上常以低劑量使用，常用低劑量為每日 100 mg（原文引文：aspirin 100 mg daily）。此劑量資訊可作為閱讀處方或臨床紀錄時的基本辨識重點。",
      "type": "structure",
      "severity": "high",
      "description": "必備段落不齊，漏掉 frontmatter、摘要表、🩺 小評論與免責聲明。",
      "suggestion": "請補齊 frontmatter、摘要表、🩺 小評論及免責聲明等必備段落。"
    }
  ]
  ```
- 用 `parseReviewIssues(raw)` 驗證：`PARSE-OK issues=1`，欄位皆通過型別/枚舉正規化（`type=structure`、`severity=high` 均為合法值，未落入 unknown fallback）。

### 變體 C：內容當參數 —— 未測試

Variant B 已成功且輸出乾淨（純 JSON，無多餘文字），依 Step 4 指示「依序試三個變體，記錄第一個成功者」，故未再測試 Variant C（`agy -p "$(cat review-input.md)" </dev/null`）。若未來 Variant B 因輸入內容包含會被誤判成指令的內容而失敗，可退回試 Variant C 作為備案；已知輸入長度限制仍是 <25K 字元。

**結論**：agy 在無 `--dangerously-skip-permissions` 時**無法自主讀本機檔案**（不是卡住，是直接放棄並反問路徑），必須把待審內容**透過 stdin 管入**，agy 才能正確處理並照 JSON 契約輸出。

## 3. 最終選定的指令模板（逐字，供 Task 4 SKILL.md 直接引用）

### codex 起草（讀工單檔，寫目標檔）

```bash
codex exec --skip-git-repo-check -s workspace-write "讀取本目錄的 ticket.txt，依工單內容執行。" </dev/null
```

- `ticket.txt` 為 `buildDraftTicket()` 產出的工單內容，需先寫入執行目錄。
- 工單內的 `outFile`（如 `smoke-draft.md`）必須與呼叫 codex 時的 cwd 相對路徑一致，codex 會在該 cwd 用 `apply patch` 直接建立/覆寫該檔。
- 必須帶 `-s workspace-write`（或更寬鬆的 sandbox），否則預設 `read-only` sandbox 會讓寫檔被拒且不會跳出核准提示。
- stdin 必須關閉（`</dev/null`），否則會卡住等待輸入。

### agy 審查（stdin 管入審查輸入，輸出 JSON）

```bash
agy -p "依 stdin 內容中的指示輸出 JSON。" < review-input.md
```

- `review-input.md` 為 `buildReviewPrompt()` 產出的審查提示全文（已內含 JSON 輸出契約、工單、源文摘錄、草稿全文）。
- 這是唯一允許不加 `</dev/null` 的呼叫型式——檔案本身就是 stdin。
- agy 目前無法在無 `--dangerously-skip-permissions` 的情況下自行讀取本機檔案路徑（見上方變體 A），因此不可用「讀檔」型式，一律走 stdin 管入。
- 輸出需再丟給 `parseReviewIssues(raw)` 解析驗證；已實測可正確解析出合法 issue 陣列。
- 建議仍包一層逾時保護（如 `timeout 240 agy -p ... < review-input.md`），避免極端情況下的掛起。

## 4. 對 spec §5.2/§5.3 假設的修正

| 假設 | 原文 | 實測結果 |
|---|---|---|
| (a) codex 能照短 prompt 讀工單檔並寫出目標檔 | 假設成立 | **需補一個條件**：沒有 `-s workspace-write`（或等效允許寫入 sandbox）就會失敗；加上該旗標後成立，讀檔＋寫檔皆正確，內容也正確保留必述事實數字。 |
| (b) `agy -p` 無 `--dangerously-skip-permissions` 時能否讀檔 | 未知，疑慮卡權限提示 | **不成立**：agy 不會卡住，但也不會自行讀檔（直接回覆不知道 cwd，要求提供絕對路徑）。必須改用 stdin 管入內容，這個型式已驗證可行且輸出乾淨可解析。 |
