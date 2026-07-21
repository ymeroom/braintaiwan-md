---
name: md-series
description: 產生一個 BrainTaiwan MD 臨床導讀系列——由主 agent（Opus）自己讀源文、自己寫每一篇，claim-ledger 逐條釘回源文，通過閘門才 build+commit+push。觸發：使用者輸入 /md-series 或要求「做一個 X 系列」。
---

# md-series v4：單一代理（Opus）臨床導讀產線

**這條產線沒有外包環節。** 讀源文、起草、查核、build 全部由當下這個主 agent 在自己的
loop 裡完成。

## 為什麼不外包

歷史上試過兩種外包，兩種都退回來了：

| 做法 | 結果 |
|---|---|
| **異質多代理**（v3：`codex exec` 起草 → `agy -p` 審查 → 仲裁） | 2026-07-03 糖尿病系列實測，品質被使用者評為「超級爛」——英文源文引號與 pdftotext 亂碼被原封抄進正文，事後清理又清出斷裂接縫。事實是準的，但抓不到房子語氣。 |
| **subagent 逐篇跑**（`superpowers:subagent-driven-development`） | 2026-07-21 sjd 系列實測，**燒完整個 5 小時 usage window，7 篇只完成 1 篇**。改由主 agent 直寫後，同一個 session 內補完其餘 6 篇並完成 build/commit/push。 |

原因是同一個：一個系列的每一篇**共用同一份源文與同一套慣例**（英文引文格式、
`(1, C) (SOA 98.75%)` 標記、🩺 小評論的 h3 寫法、判讀重點表欄位、前後篇的伏筆）。
切給獨立 context 就是每篇重讀一次幾百 KB 的源文、重新推導一次慣例，再由主 agent
讀報告核對一次。而主 agent 寫到第 5 篇時，前 4 篇的用語與伏筆都還在手上。

**模型用 Opus。** 這條產線的瓶頸是判斷力（抓原文自相矛盾、決定哪個版本可信、
把證據等級的語氣翻對），不是產出量。

## 參數

`/md-series --src <pdf...> --topic "<主題>" --n <篇數> [--prefix <前綴>] [--dry-run] [--no-gate]`

- `--src`：來源 PDF 路徑（可多份，多源文時指定主軸）
- `--topic`／`--n`／`--prefix`：主題、篇數、輸出前綴（`<prefix>01.html`…）
- `--dry-run`：做到 build 為止，不 commit/push
- `--no-gate`：跳過閘門（僅在明確知情時；commit 訊息須加前綴「⚠ 未經驗證：」）

## 1. Ingest

- `srcDir` = `D:/claudecode/<prefix>-articles/`，原始 PDF 一併留存。
- **源文一律走 Mistral OCR**：`python D:/claudecode/tools/mistral-ocr.py`（引擎版本釘住並寫進
  `_source.md` 開頭）。**不要用 pdftotext 當 ground truth**——它會靜默吃掉 `≥`／`≤`／`±`，
  也會把 Lancet 風格的小數點「·」讀成連字號（`0.3–3.7%` → `0–3% and 3–7%`），而句子仍然通順。
- 多份源文時分開存（`_source_<label>.md`），並在每篇文章的「主要來源」區同時列出。
- **關鍵數字要轉圖核校**：`pdftoppm -r 150 -png -f <頁> -l <頁> x.pdf pg`，用 Read 看圖，
  逐格比對表格與百分比。表格、劑量、建議等級這三類必核。

## 2. Plan

讀完源文後決定架構，寫進 `series.json`（欄位由 `lib/series-schema.js` 驗證，
`card.tags` 必須**恰好 2 個**字串，少一個或多一個 build 時直接拋錯）。

同時決定 index 掛法——**這一步錯了會弄壞線上頁面**：

| 情況 | 做法 |
|---|---|
| **全新獨立分類** | 可正常用 `build.js` 的 applyIndex（會自動插 `<!-- SERIES:xxx -->` 區塊） |
| **併入既有分類**（成為第 N 個子系列） | **手動嵌入 index.html，絕對不要跑 applyIndex**——它會把子系列插成一個重複的獨立分類。改寫一支只呼叫 `writePages()` 的 `build-pages.js`（範例見 `tth-articles/`、`fus-articles/`） |

併入既有分類時，同時要改該分類的 `topic-count` 與 `guideline-note` 的資料來源區。

## 3. Draft（主 agent 自己寫，一篇一篇來）

每一篇的節奏固定五步，做完才進下一篇：

1. 讀源文的對應段落（用標題文字搜尋定位，不要依賴行號）
2. 寫 `<NN>-<slug>.md`
3. 追加該篇的 claim ledger 到 `_gate.js`
4. 跑閘門確認這一篇全過
5. 回填 `series.json` 的該筆 `card.title` / `card.desc`

**全部寫完才 build 一次**，不要每篇 build。

寫作規格：

- 語氣依 `feedback_writing-style`，並比照站上既有頁（如 https://md.braintaiwan.com/ais02.html）：
  開門見山、費曼式提問、粗體點題、有標題有表格、結尾停在一個觀察而不呼籲行動。
- frontmatter 只有 `title`；接一段 `> **系列導讀．第 NN 篇**　…` 的導言。
- 小評論寫成 `> ### 🩺 神經專科醫師　施懿恩・小評論`（h3 才會是粗體深藍）。
- 每篇結尾固定「臨床判讀重點」表（常見印象 vs 文獻實際說法）＋「主要來源」＋免責聲明。
- **原文自相矛盾要標出來，不要靜靜挑一個寫**。這是這個系列最有價值的部分——歷來抓到的包括
  劑量單位錯置、量詞方向相反（at least vs up to）、摘要圖與正文的劑量上限不一致、
  引註編號指向錯誤文獻、參考文獻頁碼倒序。標註時說明採用哪個版本與理由。
- **不外借源文以外的文獻**。原文薄的地方就寫薄，並明說它薄——把空白畫準本身就是資訊。

## 4. Verify + Gate

`_gate.js` 建 ledger，每條斷言 `{ sentence, claimType, value, classification, sourceQuote }`，
並對 `_source.md` 做**字面 `includes` 回查**（比 `lib/gate.js` 的 HIGH_RISK 判定更嚴：
任何一條 sourceQuote 對不上就擋，不分 claimType）。範例實作見 `sjogren-articles/_gate.js`。

- 判定用實際比對結果**覆寫** `c()` 裡寫死的 SUPPORTED——落盤的是查證結果，不是宣稱。
- 放行門檻：**全部斷言 SUPPORTED**。任何 CONTRADICTED 或查無出處者，改文章或在文中
  明確標註原文限制後才放行，**不得以「比例夠高」放過**。
- 產物：`_ledgers/NN.json`（勿手改）、`_verification-report.md`。
- 閘門未過 → **停**：不 build、不 commit/push，回報阻擋摘要。

## 5. Assemble + Publish

```
node build.js <srcDir>/series.json      # 併入既有分類時改用 build-pages.js
node enhance-md-footer.js               # 需先在 SERIES map 註冊 prefix，否則整個系列被 skip
node enhance-md-mobile.js
node seo-build.js
node --test                             # 既有測試須全綠
```

三個 enhancer 的順序不可調換。跑完檢查：分類內卡片數、`<div>` 開閉平衡、每張卡對應的
HTML 檔存在、無亂碼（搜 `�`）。

commit 前確認沒有夾帶不相干的改動。**若 worktree 裡有別人未完成的工作共用同幾個檔案**
（index.html、enhance-md-footer.js、sitemap.xml），用
`git hash-object -w` ＋ `git update-index --cacheinfo` 把「抽掉對方區塊的版本」寫進暫存區，
工作目錄完全不動——比 `git add -p` 或 patch 手術安全。

commit 訊息要寫明：掛哪個分類、index 是手動還是 applyIndex、來源完整書目、閘門數字、
標註了原文哪幾處瑕疵。發布（push）需使用者在當次對話明確同意。

## 稽核產物

| 檔案 | 內容 |
|---|---|
| `_source*.md` | OCR 源文，全系列唯一 ground truth（含引擎版本標頭） |
| `_source.pdf` | 原始 PDF，符號存疑時轉圖目視核對 |
| `NN-*.md` | 各篇原稿 |
| `_gate.js` | claim ledger 與閘門執行器 |
| `_ledgers/NN.json`、`_verification-report.md` | 查證結果與閘門報告（自動產生，勿手改） |

## 失敗行為

| 失敗點 | 行為 |
|---|---|
| OCR 缺字或符號存疑 | 轉圖核校；確認是原文如此才寫進 ledger |
| 閘門未過 | 不 build、不 push，留全部稽核產物 |
| build／enhancer／測試失敗 | 不繼續，回報具體失敗點 |
| 使用者未同意發布 | 停在 commit，不 push |

## 醫療安全但書

閘門只查「文字是否與源文相符」，不查源文本身對不對。即使全過也產出報告供抽查。
`--no-gate` 僅在明確知情時使用。
