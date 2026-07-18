---
name: inv-charts
description: 要在投資筆記（個股／題材／總經）中新增或修改 invchart 圖表時引用本 skill，提供圖表選型決策表、欄位速查、可直接複製的範例與常見錯誤檢查清單。其他分析 skill 產圖或手動補圖時皆先讀本 skill。唯一權威語法規格為 docs/圖表語法.md。
---

# inv-charts — invchart 圖表共用參考

在任何投資筆記中要畫圖時引用本 skill。本 skill 是操作摘要；**唯一權威規格是 `docs/圖表語法.md`（v1.2 凍結版）**。語法、欄位、渲染細節有任何疑義，一律以該文件為準；要改語法先改那份文件，別在本 skill 自行擴充。

## 何時使用

- 在個股／題材／總經筆記中要新增或修改圖表時。
- 其他分析 skill 需要產出圖表段落時，套用本 skill 的選型與欄位規則。
- 檢查既有 invchart 區塊是否合規（跑「常見錯誤檢查清單」）。

## 鐵律（每張圖都要遵守）

- **不發明數字**：資料只能來自筆記中已存在、或已查證附來源的數字。查無資料時圖上該項標「無資料」或直接不畫，**不得腦補**。
- **每個數字附來源與時點**：`source`、`asOf` 為必填。關鍵數字需 2 個以上來源交叉比對，交叉來源寫進圖下方對應表格。
- **圖不取代表**：圖放在對應資料表格的**前面**輔助閱讀，精確數值仍以表格為準（圖＋表並存）。
- **區間值取中點入圖**：如 `12~13 萬片` → 入圖用 `12.5`，並在 `source` 或表格註明原始區間（例：`source: TrendForce 2026-06-15（區間值取中點，精確區間見下表）`）。
- **一篇筆記 3~5 張圖為上限**：只畫會改變理解的資料；少於 3 個資料點、或表格一眼可讀的不畫。
- **色彩**：中性資料（營收、產能、市佔）用內建色盤，**不套紅漲綠跌**（那是 K 線慣例）。省略 `colors` 即可。
- **日期一律台灣時間（UTC+8）**；`asOf` 用 `2026-06` / `2026 Q1` / `2026-07-09` 等格式。
- 筆記結尾固定加一行：`本筆記僅供個人研究參考，非投資建議。`

## 圖表選型決策表

先問一句：這組資料是**佔比**、**趨勢**、還是**比較**？再對照下表。

| 資料形態 | `type` | 額外欄位 | 範例 |
|---|---|---|---|
| 佔比／組成（單一時點，≤7 項） | `pie` 或 `donut` | — | 營收結構、CoWoS 產能分配 |
| 佔比但 >7 項，或類別名很長 | `bar` | `horizontal: true` | 法人目標價比較 |
| 趨勢（時間序列） | `line` | — | 毛利率逐季、利率走勢 |
| 離散期間比較 | `bar` | — | 年度市場規模、產能擴張 |
| 量＋率 雙軸 | `bar-line` | 兩組 `series` 各給 `type`，率放 `yAxis: right` | 月營收＋YoY%、營收＋毛利率 |
| 結構隨時間變化 | `bar` | `stacked: true` | 各平台營收佔比逐季 |

## 欄位速查表

| 欄位 | 必填 | 型別 | 說明 |
|---|---|---|---|
| `type` | ✅ | string | `bar` \| `line` \| `pie` \| `donut` \| `bar-line` |
| `title` | ✅ | string | 圖表標題 |
| `labels` | ✅ | string[] | X 軸類別或圓餅扇區名稱 |
| `series` | ✅ | array | 資料系列；**`pie`/`donut` 恰好一組** |
| `series[].name` | ✅ | string | 系列名稱（圖例） |
| `series[].data` | ✅ | number[] | 數值，**長度必須等於 `labels`** |
| `series[].type` | bar-line 必填 | string | `bar` 或 `line`（僅 `bar-line` 使用） |
| `series[].yAxis` | — | string | `left`（預設）\| `right`（僅 `bar-line`） |
| `unit` | — | string | 左軸／主要單位（如 `億元`、`%`、`萬片/月`） |
| `unitRight` | — | string | 右軸單位（僅 `bar-line`） |
| `source` | ✅ | string | 資料來源 |
| `asOf` | ✅ | string | 資料時點（`2026-06` / `2026 Q1` / `2026-07-09`） |
| `stacked` | — | boolean | 長條堆疊（預設 `false`；結構隨時間變化用） |
| `horizontal` | — | boolean | 橫向長條（預設 `false`；類別名長或類別多用） |
| `colors` | — | string[] | 自訂 hex 色票；省略用內建色盤（中性資料建議省略） |
| `height` | — | number | 圖高 px，預設 `300`，範圍 `160`~`600` |

要點：`data` 長度必須等於 `labels`；`pie`/`donut` 只能一組 `series`；`series[].type`、`series[].yAxis: right`、`unitRight` 全部僅限 `bar-line`。

## 可直接複製的範例

**圓餅（佔比／組成，單一時點）**

````markdown
```invchart
type: pie
title: 台積電營收結構（2026 Q1）
labels: [HPC, 智慧型手機, IoT, 車用, 其他, 消費性電子]
series:
  - name: 營收佔比
    data: [61, 26, 6, 4, 2, 1]
unit: "%"
source: 台積電 2026 Q1 法說會
asOf: 2026 Q1
```
````

**橫向長條（>7 項或類別名長，如法人目標價）**

````markdown
```invchart
type: bar
title: 法人目標價（2026-04~06 發布）
labels: [里昂, 花旗, 匯豐, 野村, 永豐金, 元大/凱基, Aletheia, 高盛]
series:
  - name: 目標價
    data: [3030, 2875, 2820, 2800, 2615, 2600, 2400, 2330]
horizontal: true
unit: 元
source: TechNews 2026-04、豐雲學堂 2026-06
asOf: 2026-06
```
````

**量＋率雙軸（bar-line，月營收＋YoY%）**

````markdown
```invchart
type: bar-line
title: 台積電 月營收與年增率
labels: [2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06]
series:
  - name: 月營收
    type: bar
    data: [2932, 2600, 2853, 3495, 3205, 3170]
  - name: YoY
    type: line
    yAxis: right
    data: [35.9, 43.1, 46.5, 48.1, 39.6, 26.9]
unit: 億元
unitRight: "%"
source: 台積電自結月營收（公開資訊觀測站）
asOf: 2026-06
```
````

**結構隨時間變化（bar + stacked，各平台營收佔比逐季）**

多組 `series` 同一組 `labels`，每組 `data` 都要對齊 `labels` 長度；`stacked: true` 讓長條疊起來看組成隨時間的變化。

````markdown
```invchart
type: bar
title: 台積電各平台營收佔比（逐季）
labels: [2025 Q2, 2025 Q3, 2025 Q4, 2026 Q1]
series:
  - name: HPC
    data: [52, 57, 60, 61]
  - name: 智慧型手機
    data: [33, 30, 27, 26]
  - name: 其他
    data: [15, 13, 13, 13]
stacked: true
unit: "%"
source: 台積電各季法說會
asOf: 2026 Q1
```
````

（趨勢用 `line`、離散期間比較用直式 `bar`：語法即單組 `series`，省略上面的 `type`/`yAxis`/`stacked`/`horizontal` 即可，不另附範例。）

## 常見錯誤檢查清單

寫完每張圖，逐項核對：

- [ ] `data` 長度與 `labels` 不符（最常見；`bar-line`／stacked 等多系列時，**每組** `series` 都要各自對齊）。
- [ ] 缺 `source` 或 `asOf`（兩者皆必填，不可省）。
- [ ] `pie`/`donut` 放了多組 `series`（只能一組；多組請改 `bar` 或 `bar-line`）。
- [ ] 發明數字或未附來源（每個入圖數字都要能對回筆記表格）。
- [ ] 區間值未取中點就入圖（要取中點，並註明原始區間）。
- [ ] 一篇筆記塞超過 5 張圖（上限 3~5 張，砍到只剩會改變理解的）。
- [ ] 對中性資料誤套紅漲綠跌配色（省略 `colors` 用內建色盤）。
- [ ] `bar-line` 的 `series` 忘了給 `type`，或率沒放 `yAxis: right`。
- [ ] 圖沒有對應的資料表格在後面（圖不取代表）。
- [ ] `ticker`/日期未用台灣時間口徑。

YAML 解析失敗、缺必填、`data` 長度不符、未知 `type` 時，外掛會在區塊位置渲染**繁體中文錯誤訊息**而非整篇失敗——看到錯誤訊息就照上面清單回頭修。

## 筆記讀寫

優先使用已安裝的 **obsidian:obsidian-cli** skill 讀寫筆記（省 token）；不可用時退回一般檔案工具，路徑一律用絕對路徑。

---

再次提醒：本 skill 僅為操作摘要，**`docs/圖表語法.md` 為唯一權威規格**，衝突時以該文件為準。
