# 正常壓力水腦症（iNPH）導讀系列 — 設計文件

- 日期：2026-06-26
- 作者：施懿恩 醫師（導讀整理）
- 站別：BrainTaiwan MD（md.braintaiwan.com）
- 來源系列規畫：neuro-topic-backlog 第 6 題（NPH）

## 1. 目標與定位

製作 7 篇給醫療專業人員的 iNPH（特發性正常壓力水腦症）臨床導讀，併入 MD 站既有
「失智症診斷」分類，作為第五個子系列。核心定位是「**可治療的失智**」——把 iNPH 從
被低估、常被誤診為阿茲海默症（AD）或巴金森氏症的處境，拉回到「可辨識、可測試、可手術
逆轉」的臨床決策路徑。

敘事基調延續既有批判性導讀風格（參照 commercial-bbm-article 與 writing-style 記憶）：

- 三不：不開場白、不條列為主、不呼籲行動。
- 破迷思優先：強調誤診現實、混合病理常見、tap test 與影像的限制與陷阱。
- 證據誠實：把「能逆轉什麼、逆轉多少、證據強度多少」講清楚，不誇大手術。

## 2. 來源策略（指引＋綜述混合）

- **證據骨架**：日本 iNPH 指引 第 3 版 2021（Nakajima et al., *Neurol Med Chir
  (Tokyo)* 2021）。提供 evidence grading、DESH 影像、tap test、分流手術與術後管理。
- **敘事／流行病學補強**：近年高影響力綜述（如 Lancet Neurology／Continuum／NEJM
  類），用於誤診現實、盛行率、與退化性失智的混合病理。
- 兩類來源都抓取後轉成純文字（txt）落盤進 `D:/claudecode/nph-articles/`，作為
  claim-ledger 閘門逐句比對的源文。每一篇文章的每個實質斷言都必須可回溯到落盤源文。

## 3. 內容架構（7 篇）

| # | 檔名 | 切點與重點 |
|---|------|-----------|
| ① | nph01.html | 概論與流行病學：三聯症（步態／認知／尿失禁）、「可治療的失智」、為何被低估與誤診為 AD／巴金森 |
| ② | nph02.html | 病理生理：CSF 動力學、腦室擴大、為何步態通常最先壞、DESH 的機轉假說 |
| ③ | nph03.html | 臨床評估：步態（最敏感、最易逆轉）、皮質下額葉型認知、尿失禁；常用量表與評估時機 |
| ④ | nph04.html | 影像診斷：Evans index、DESH、callosal angle、tight high convexity；MRI／CT 判讀與陷阱 |
| ⑤ | nph05.html | 鑑別診斷：與 AD、PD/PSP、血管性失智、續發性 NPH 區分；混合病理常見的臨床意涵 |
| ⑥ | nph06.html | tap test／腰椎引流／CSF 動力學測試：預測分流反應的敏感度與特異度、偽陰／偽陽陷阱 |
| ⑦ | nph07.html | 分流手術與術後：VP/LP shunt、可調壓閥、ETV、手術指徵與時機、併發症、預後、轉介時機 |

## 4. 視覺與系統整合

- 前綴：`nph`；輸出 `nph01.html`–`nph07.html` 至 `D:/claudecode/braintaiwan-md/`。
- 配色：**cyan／青**（冷調、偏醫療感；與「失智症診斷」區既用的 indigo／teal／amber／
  red／purple 五個子系列全部區隔）。
- 分類掛載：併入 index.html「失智症診斷」topic 區塊，新增第五子系列卡片組；卡片描述
  以「可治療的失智」鉤子並交叉連結至同區 AD 診斷子系列。
- byline：`施懿恩 醫師．神經內科 · 導讀整理 2026 年`。

## 5. 產線（沿用既有 md-series 流程）

1. 抓取日本 2021 指引與綜述 → 轉 txt 落盤至 `nph-articles/`（源文）。
2. 撰寫 series.json（prefix／seriesTag／section／7 篇 articles 與卡片文案）。
3. 逐篇 draft 落盤（01–07 .md），每篇建立 claim-ledger。
4. claim-ledger 閘門驗證：需高比例 SUPPORTED 才放行（沿用 GBS 197/197、ICH
   203/204 的標準）；攔到的實質錯誤逐項修正後重驗。
5. `node build.js nph-articles/series.json` 套版並掛 index。
6. 預覽驗證後 push（push 需明確核可）。
7. FB 輪播卡循例先產草稿、先存不排程（依 fb-carousel-default 記憶）。

## 6. 範圍界線（YAGNI）

- 只做 MD 專業導讀 7 篇；不在本批做 Media 大眾衛教版（可日後另開）。
- 本批不含 FB 排程，只到草稿落盤。
- 不處理續發性 NPH 的完整外科細節，僅在 nph05／nph07 點到鑑別與轉介層級。

## 7. 成功標準

- 7 篇全數通過 claim-ledger 閘門（高比例 SUPPORTED）。
- 每個實質斷言可回溯到落盤源文。
- 正確掛入「失智症診斷」分類、cyan 配色、導覽與交叉連結正常。
- 本機預覽無破版；風格符合三不與破迷思基調。
