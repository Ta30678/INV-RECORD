---
name: macro-analysis
description: 研究單一總經主題並產出結構化總經筆記到 vault/10-總經/。當使用者要分析宏觀變數（FED/央行利率決策、CPI/通膨、PMI、台灣出口/景氣、匯率、油價等）對台股與持有題材的影響時觸發；產出含標準圖表組、資料來源、題材連結，並更新總經 MOC。
---

# 總經分析（macro-analysis）

輸入：一個總經主題（例：「FED 利率」「6 月 CPI」「台灣出口」）。
輸出：`vault/10-總經/<YYYY-MM 主題>.md` 一篇 `type: macro` 筆記，並回頭更新 `vault/10-總經/總經 MOC.md`。

## 開始前必讀（每次都讀，不要憑記憶）

- `docs/圖表語法.md` — invchart 唯一權威規格與圖表選型規範；本檔僅摘要，衝突時以原文件為準。
- `docs/資料格式.md` — 筆記層 frontmatter 慣例（總經為 `type: macro`）。
- 範例：`vault/10-總經/2026-07 FED 利率決策.md`（frontmatter 與段落慣例）、`vault/90-模板/總經筆記模板.md`。

## 工作流程

1. **界定主題與關鍵變數**：把主題拆成 2~4 個可量化的觀察變數（例：FED 利率 → 政策利率區間、點陣圖中位、FedWatch 各情境機率、10Y 殖利率）。
2. **蒐集資料並交叉比對**（見「資料來源」）：每個數字都要能回答「哪裡來、哪個時點」。關鍵數字至少兩個獨立來源比對，不一致時取區間、在表格標明分歧。
3. **撰寫筆記**：沿用下方 frontmatter 與段落結構，寫進 `vault/10-總經/<YYYY-MM 主題>.md`。
4. **畫標準圖表組**：只畫有資料的圖，圖前表後（見「標準圖表組」）。
5. **連結受影響題材**：末段列出被此變數牽動的題材筆記與方向（利多/利空/中性）與傳導邏輯。
6. **更新總經 MOC**：把新筆記加入 `總經 MOC.md` 對應區塊。

## 檔名與 frontmatter

- 檔名 / H1 標題：`<YYYY-MM 主題>`，`YYYY-MM` 取**台灣時間**當月（例 `2026-07 FED 利率決策`、`2026-06 台灣出口`）。同月同主題已存在則 append 更新，不另開新檔。
- frontmatter 沿用現有 macro 寫法：

```yaml
---
type: macro
date: 2026-07-12          # 事件/資料基準日，YYYY-MM-DD，台灣時間
created: "2026-07-12 21:00"  # 帶引號字串 "YYYY-MM-DD HH:mm"，台灣時間
updated: ""
up: "[[總經 MOC]]"
central-bank: FED          # 僅央行類主題填（FED / 央行(台灣) / ECB / BOJ…）；非央行主題可整行省略
tags: [總經, 利率]         # 第一個固定「總經」，第二個放主題子類（利率/通膨/出口/匯率…）
---
```

## 筆記段落結構

以模板三段為骨幹並補齊數據與風險段（沒資料的段落寫「無資料」，不要空著也不要腦補）：

- `## 事件 / 主題現況` — 這次決策/數據發布的事實與最新讀數，逐點附來源與時點。
- `## 關鍵數據` — 先圖後表（圖 → 對應精確數值表格）；表格是精確值的權威，圖只是輔助閱讀。
- `## 對市場的影響` — 對美債殖利率、美元/台幣、外資資金流、大盤的傳導。
- `## 對持有題材的影響` — 連結題材筆記＋方向＋邏輯（見「題材連結」）。
- `## 風險與不確定性` — 反向情境、資料品質保留（哪些是第三方估算/未經官方證實）。
- `## 參考來源` — 節錄主要連結。
- 檔案最後一行固定：`本筆記僅供個人研究參考，非投資建議。`

## 標準圖表組（有資料才畫，一篇 3~5 張為上限）

一律用 ` ```invchart ` 區塊，欄位 `type/title/labels/series/source/asOf` 必填；`data` 長度必須等於 `labels`。**圖前表後**：每張圖下方接一張精確數值表。區間值（如「12~13 萬片」「降 1~2 碼」）**入圖取中點**，在 `source` 或表格註明原區間。中性總經數據用內建色盤，不套紅漲綠跌。

1. **政策利率 / 殖利率走勢（line）** — 逐月或逐次會議的政策利率、10Y/2Y 殖利率。

```invchart
type: line
title: FED 政策利率上緣 vs 美債 10Y 殖利率
labels: [2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06]
series:
  - name: 政策利率上緣
    data: [4.50, 4.50, 4.25, 4.25, 4.00, 4.00]
  - name: 美債10Y
    data: [4.35, 4.28, 4.10, 4.05, 3.98, 3.90]
unit: "%"
source: FOMC 聲明、FRED（DGS10）
asOf: 2026-06
```

2. **通膨 / PMI 逐月（line）** — CPI/核心 CPI 年增率或製造業 PMI 逐月。量＋率並陳時改用 `type: bar-line`（月增 bar 走左軸、年增 line 走右軸）。

```invchart
type: line
title: 美國 CPI 年增率（總體 vs 核心）
labels: [2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06]
series:
  - name: CPI年增
    data: [2.9, 2.8, 2.6, 2.5, 2.4, 2.3]
  - name: 核心CPI年增
    data: [3.3, 3.2, 3.1, 3.0, 2.9, 2.8]
unit: "%"
source: 美國勞工統計局 BLS、MacroMicro 交叉比對
asOf: 2026-06
```

3. **情境機率（bar）** — 如 CME FedWatch 對下次會議各結果的定價機率；labels 放情境、series 放機率。

```invchart
type: bar
title: FedWatch 對 2026-07 FOMC 的定價機率
labels: [維持不變, 降1碼, 降2碼]
series:
  - name: 機率
    data: [22, 68, 10]
unit: "%"
source: CME FedWatch
asOf: 2026-07-10
```

> 選型準則（詳見 `docs/圖表語法.md` 選型表）：趨勢/時間序列→line；離散期間或情境比較→bar；量＋率雙軸→bar-line；佔比（≤7 項單一時點）→pie/donut；結構隨時間→stacked bar。少於 3 個資料點、或表格一眼可讀的不畫。

## 題材連結（末段必做）

在 `## 對持有題材的影響` 逐條寫「題材 → 方向 → 邏輯」，題材用 `[[wikilink]]` 連到 `vault/20-題材/` 既有筆記（先用 obsidian-cli `search`/`backlinks` 或 Glob `vault/20-題材/*.md` 確認檔名，不要憑空猜檔名造成斷鏈）。例：

- [[先進封裝 CoWoS]]：**利多** — 降息降低 AI 資本支出融資成本，支撐雲端 capex 與 CoWoS 擴產需求。
- [[成熟製程]]：**中性偏多** — 利率下行有利消費性電子回補，但傳導較慢。

現有題材以實際 vault 為準：寫連結前先 Glob `vault/20-題材/*.md` 或 obsidian-cli `search` 取當前清單（截至撰稿約有：先進封裝 CoWoS、光通訊 CPO、成熟製程、先進製程設備廠），**不要憑這份可能過期的清單猜檔名**。查無對應題材時明說「目前無對應題材筆記」，不硬湊、不造斷鏈。

## 更新總經 MOC

寫完筆記後，把 `[[<YYYY-MM 主題>]]` 加進 `vault/10-總經/總經 MOC.md`：央行決策放「## 央行」、其他放「## 主題」；相關待辦（如下次會議日、下次數據發布）視情況補到「## 待追蹤」。用 obsidian-cli `append`／`property:set` 或 Edit 精準插入，不要覆寫整檔。

## 筆記讀寫工具

優先用 `obsidian:obsidian-cli` skill（省 token、走 metadataCache）；Obsidian 未開或指令失敗時退回一般檔案工具（Read/Write/Edit），路徑一律用絕對路徑（主檔寫到 `vault/10-總經/<YYYY-MM 主題>.md`）。

常用指令（第一個參數用 `vault=<你的 vault 名>` 指定 vault；名稱含空格要加引號）：
```bash
obsidian search query="<主題關鍵字>" limit=10           # 查同月同主題是否已存在、找相關題材
obsidian read file="2026-07 FED 利率決策"               # 讀既有筆記/模板當結構樣板
obsidian create name="<YYYY-MM 主題>" content="..." silent  # 建新總經筆記（silent 不自動開啟）
obsidian property:set name="updated" value="<台灣時間>" file="<YYYY-MM 主題>"  # 增修既有筆記時填 updated
obsidian append file="總經 MOC" content="- [[<YYYY-MM 主題>]]"  # 更新 MOC（也可用 Edit 精準插入到對應區塊）
obsidian backlinks file="<YYYY-MM 主題>"                # 完成後確認題材反查連結
```

## 共通紀律（每篇都遵守）

- 每個數字附**來源＋資料時點**；invchart 的 `source`/`asOf` 一律填實。
- 關鍵數字（利率、機率、CPI、出口金額/年增）至少**兩個獨立來源**交叉比對。
- 查無資料明確標「**無資料**」，不得推估冒充事實；第三方估算/媒體轉述要標明非官方。
- **區間值入圖取中點**並註明原區間；精確區間留在表格。
- 日期時間一律**台灣時間（UTC+8）**。
- 檔案結尾固定：`本筆記僅供個人研究參考，非投資建議。`

## 資料來源建議（依主題）

| 主題 | 官方 / 一手 | 交叉比對 |
|---|---|---|
| FED 利率、FOMC | FOMC 聲明與點陣圖、FED SEP、FRED | CME FedWatch、MacroMicro |
| 台灣利率 | 中央銀行理監事會決議、央行新聞稿 | MacroMicro、財經媒體 |
| CPI / 通膨（美） | BLS CPI Release | FRED、MacroMicro |
| CPI / 物價（台） | 主計總處（DGBAS）物價統計 | 央行、MacroMicro |
| PMI | ISM（美）、中經院/台經院（台） | MacroMicro |
| 台灣出口 / 外銷訂單 | 財政部海關進出口、經濟部外銷訂單 | 主計總處、MacroMicro |
| 匯率 / 油價 | 央行、EIA/CME | FRED、MacroMicro |

一手官方文件為準，第三方（MacroMicro 等）用於交叉驗證與圖表化；兩者衝突時在表格保留分歧、於風險段說明。

## 完成前自檢

- [ ] 檔名 / H1 為 `<YYYY-MM 主題>`，`YYYY-MM` 取台灣當月；同月同主題為**增修**而非另開新檔。
- [ ] frontmatter `type: macro`、`date`／`created` 為台灣時間、`up: "[[總經 MOC]]"`；央行類主題才填 `central-bank`，非央行主題整行省略。
- [ ] 每個數字都附**來源＋資料時點**；關鍵數字（利率、機率、CPI、出口金額/年增）有**兩個以上獨立來源**交叉。
- [ ] 查無資料處明標「**無資料**」；第三方估算/媒體轉述已標明非官方；沒有腦補冒充事實。
- [ ] 圖表遵守 `docs/圖表語法.md`：圖前表後、每張有 `source`/`asOf`、**區間值取中點並註明**、一篇 ≤5 張、非紅漲綠跌、`data` 長度＝`labels`。
- [ ] `## 對持有題材的影響` 逐條寫「題材 → 方向 → 邏輯」，wikilink 對齊 vault 既有題材檔名（無對應則明說），不造斷鏈。
- [ ] `總經 MOC.md` 已加入 `[[<YYYY-MM 主題>]]`（央行決策入「## 央行」、其他入「## 主題」），未覆寫整檔。
- [ ] 結尾固定「本筆記僅供個人研究參考，非投資建議。」，全篇日期時間皆台灣時間（UTC+8）。
