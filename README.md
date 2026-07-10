# INV RECORD — 投資追蹤紀錄系統

個人投資追蹤、紀錄軟體：**Obsidian 自製外掛 + vault 模板**。

以 `.md` 筆記為核心，三層架構組織投資思考（**總經 → 題材 → 個股／交易**），
外掛提供台股 K 線圖與 FIFO 損益儀表板。

## 功能

- 📝 **三層筆記系統**：總經趨勢（FED／台日歐央行利率決策）→ 產業題材 → 個股邏輯與交易紀錄，
  以 `up:` / `stock:` / `theme:` frontmatter 雙向連結串接
- 🕸 **Graph View 分層著色**：藍=總經、紫=題材、橘=個股、紅=交易（Obsidian 原生關係圖）
- 📈 **K 線圖**：筆記內 ` ```kline ` 區塊即時載入 Yahoo Finance 日/週/月 K，
  台式紅漲綠跌、跟隨明暗主題、含成交量
- 💰 **績效儀表板**：FIFO 損益引擎——持倉均價（含手續費攤入）、未實現損益、
  月度已實現損益與報酬率、資料警告
- ⚡ **快速記帳**：指令一鍵建立交易紀錄，自動試算手續費（0.1425%）與證交稅（0.3%）

## 快速開始

1. 把 `vault-template/` 複製一份，用 Obsidian 開啟為 vault
2. 依提示啟用社群外掛（外掛已內附於模板中）
3. 打開 `30-個股/台積電 2330` 看 K 線圖，`Ctrl/Cmd + P` → 「開啟績效儀表板」

詳見 [docs/安裝指南.md](docs/安裝指南.md)、[docs/使用說明.md](docs/使用說明.md)、[docs/資料格式.md](docs/資料格式.md)。

## Repo 結構

```
plugin/          Obsidian 外掛原始碼（TypeScript + esbuild + vitest）
vault-template/  開箱即用的 vault 模板（含外掛、範例筆記、Graph 著色設定）
docs/            繁中文件：安裝、使用、資料格式
```

## 開發

```bash
cd plugin
npm install
npm test              # 56 個單元測試（FIFO、Yahoo 解析、費用試算…）
npm run build         # tsc 型別檢查 + esbuild 打包
npm run install:vault # 把 build 產物裝進 vault-template
npm run check:yahoo   # 選跑：實測 Yahoo endpoint
```

## 技術備忘

- Yahoo `v8/finance/chart/{ticker}.TW`；時間戳 UTC +8h 對齊台灣交易日
- Obsidian `requestUrl` 原生繞過 CORS，瀏覽器沙盒的限制在外掛架構下不存在
- 圖表庫：[lightweight-charts](https://github.com/tradingview/lightweight-charts) v5
  （注意 v5 API 為 `chart.addSeries(CandlestickSeries, …)`）

前身原型：「操盤手札」(Trade Chronicle) — Claude Web 上開發的行動端台股交易日誌。
