import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type InvRecordPlugin from "../main";
import { estimateFee, estimateTax, type FeeSettings } from "../trades/fees";
import {
  buildUpFieldValue,
  findNoteByTypeAndBasename,
  findStockNoteByTicker,
  findThemeNoteByName,
  parseThemeNames,
  stockNoteBaseName,
  wikilinkFromPath,
  type VaultNoteRef,
} from "../trades/noteLinks";
import { taiwanNowString, taiwanToday } from "../utils/time";
import { normalizeTicker } from "../yahoo/parse";

/** 讀出 vault 內所有筆記的路徑與 frontmatter，供雙向鏈結反查用（儀表板個股別明細表的連結反查也共用此函式）。 */
export function listVaultNotes(app: App): VaultNoteRef[] {
  return app.vault.getMarkdownFiles().map((f) => ({
    path: f.path,
    frontmatter: app.metadataCache.getFileCache(f)?.frontmatter as
      | Record<string, unknown>
      | undefined,
  }));
}

/** 依序尋找不衝突的檔名（同日多筆自動加序號） */
async function availablePath(
  app: App,
  folder: string,
  baseName: string
): Promise<{ path: string; seq: number }> {
  for (let seq = 1; ; seq++) {
    const suffix = seq === 1 ? "" : ` ${seq}`;
    const path = normalizePath(`${folder}/${baseName}${suffix}.md`);
    if (!app.vault.getAbstractFileByPath(path)) return { path, seq };
  }
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const normalized = normalizePath(folder);
  if (!app.vault.getAbstractFileByPath(normalized)) {
    await app.vault.createFolder(normalized).catch(() => {});
  }
}

async function createAndOpen(app: App, path: string, content: string): Promise<void> {
  const file = await app.vault.create(path, content);
  if (file instanceof TFile) {
    await app.workspace.getLeaf(false).openFile(file);
  }
}

/** 證交稅別：稅率由標的類型決定，Yahoo 無可靠類型欄位可自動判別，故用下拉手選。 */
type TaxKind = "normal" | "etf" | "bondEtf";

/** "normal" 回傳 undefined，改用全域 taxRate 設定；ETF/債券ETF 為固定覆寫稅率。 */
const TAX_KIND_RATES: Record<TaxKind, number | undefined> = {
  normal: undefined,
  etf: 0.001,
  bondEtf: 0,
};

/** 0.003 → "0.3%"（避免浮點數乘法產生的尾數雜訊，例如 0.003*100=0.30000000000000004） */
function formatPercent(rate: number): string {
  return `${Number((rate * 100).toFixed(4))}%`;
}

/** 新增交易紀錄的輸入 Modal：自動試算手續費與證交稅。 */
export class NewTradeModal extends Modal {
  private date = taiwanToday();
  private time = "";
  private ticker = "";
  private name = "";
  private themeName = "";
  private action: "buy" | "sell" = "buy";
  private qty = 1000;
  private price = 0;
  private fee = 0;
  private tax = 0;
  private taxKind: TaxKind = "normal";
  private feeTouched = false;
  private taxTouched = false;
  private feeInput: HTMLInputElement | null = null;
  private taxInput: HTMLInputElement | null = null;

  constructor(
    app: App,
    private plugin: InvRecordPlugin
  ) {
    super(app);
  }

  private feeSettings(): FeeSettings {
    const s = this.plugin.settings;
    return {
      feeRate: s.feeRate,
      feeDiscount: s.feeDiscount,
      taxRate: s.taxRate,
      minFee: s.minFee,
      oddLotMinFee: s.oddLotMinFee,
    };
  }

  /** 使用者沒手動改過費用時，隨股數/價格/證交稅別重算 */
  private recalcFees(): void {
    if (!this.feeTouched) {
      this.fee = estimateFee(this.qty, this.price, this.feeSettings());
      if (this.feeInput) this.feeInput.value = String(this.fee);
    }
    if (!this.taxTouched) {
      this.tax = estimateTax(
        this.qty,
        this.price,
        this.action,
        this.feeSettings(),
        TAX_KIND_RATES[this.taxKind]
      );
      if (this.taxInput) this.taxInput.value = String(this.tax);
    }
  }

  onOpen(): void {
    this.titleEl.setText("新增交易紀錄");
    const { contentEl } = this;

    new Setting(contentEl).setName("日期").addText((t) =>
      t.setValue(this.date).onChange((v) => (this.date = v.trim()))
    );

    new Setting(contentEl)
      .setName("成交時間")
      .setDesc("選填，24 小時制 HH:mm；同日多筆交易的先後順序以此為準（優於建檔序號）")
      .addText((t) =>
        t.setPlaceholder("09:05").onChange((v) => (this.time = v.trim()))
      );

    new Setting(contentEl)
      .setName("代號")
      .setDesc("例如 2330、0050；上櫃請加 .TWO，例如 6488.TWO")
      .addText((t) =>
        t.setPlaceholder("2330").onChange((v) => (this.ticker = normalizeTicker(v)))
      );

    new Setting(contentEl).setName("名稱").addText((t) =>
      t.setPlaceholder("台積電").onChange((v) => (this.name = v.trim()))
    );

    new Setting(contentEl)
      .setName("題材")
      .setDesc("選填，連到題材筆記；留空則不寫入 theme:")
      .addText((t) =>
        t.setPlaceholder("AI 半導體").onChange((v) => (this.themeName = v.trim()))
      );

    new Setting(contentEl).setName("買 / 賣").addDropdown((d) =>
      d
        .addOption("buy", "買進")
        .addOption("sell", "賣出")
        .setValue(this.action)
        .onChange((v) => {
          this.action = v as "buy" | "sell";
          this.recalcFees();
        })
    );

    new Setting(contentEl)
      .setName("證交稅別")
      .setDesc("僅影響證交稅試算預填；不會另存欄位，frontmatter 只記最終 tax 金額")
      .addDropdown((d) =>
        d
          .addOption("normal", `一般股票 ${formatPercent(this.plugin.settings.taxRate)}`)
          .addOption("etf", `ETF ${formatPercent(TAX_KIND_RATES.etf!)}`)
          .addOption("bondEtf", "債券ETF 0%（現行免徵）")
          .setValue(this.taxKind)
          .onChange((v) => {
            this.taxKind = v as TaxKind;
            this.recalcFees();
          })
      );

    new Setting(contentEl)
      .setName("股數")
      .setDesc("支援零股")
      .addText((t) =>
        t.setValue(String(this.qty)).onChange((v) => {
          this.qty = Number(v) || 0;
          this.recalcFees();
        })
      );

    new Setting(contentEl).setName("成交價").addText((t) =>
      t.onChange((v) => {
        this.price = Number(v) || 0;
        this.recalcFees();
      })
    );

    new Setting(contentEl)
      .setName("手續費")
      .setDesc("自動試算，可手動修改")
      .addText((t) => {
        this.feeInput = t.inputEl;
        t.setValue(String(this.fee)).onChange((v) => {
          this.feeTouched = true;
          this.fee = Number(v) || 0;
        });
      });

    new Setting(contentEl)
      .setName("證交稅")
      .setDesc("賣出自動試算，可手動修改")
      .addText((t) => {
        this.taxInput = t.inputEl;
        t.setValue(String(this.tax)).onChange((v) => {
          this.taxTouched = true;
          this.tax = Number(v) || 0;
        });
      });

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("建立")
        .setCta()
        .onClick(() => void this.create())
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async create(): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) {
      new Notice("日期格式須為 YYYY-MM-DD");
      return;
    }
    if (this.time && !/^\d{2}:\d{2}$/.test(this.time)) {
      new Notice("成交時間格式須為 HH:mm（24 小時制），或留空");
      return;
    }
    if (!this.ticker) {
      new Notice("請填股票代號");
      return;
    }
    if (this.qty <= 0 || this.price <= 0) {
      new Notice("股數與成交價必須大於 0");
      return;
    }

    const s = this.plugin.settings;
    await ensureFolder(this.app, s.tradesFolder);
    const actionLabel = this.action === "buy" ? "買進" : "賣出";
    const { path, seq } = await availablePath(
      this.app,
      s.tradesFolder,
      `${this.date} ${this.ticker} ${actionLabel}`
    );

    const displayName = this.name || this.ticker;

    // stock:/theme: 一律反查既有筆記，找不到就留空，避免猜錯檔名產生 dangling link
    // 或 [[代號 代號]] 這種重複 token（見雙向鏈結決策備忘）。
    const notes = listVaultNotes(this.app);
    const stockPath = findStockNoteByTicker(notes, this.ticker);
    const stockLink = stockPath ? wikilinkFromPath(stockPath) : "";
    if (!stockPath) {
      new Notice(`尚無 ${this.ticker} 的個股筆記，stock 連結先留空，建議先用「新增個股筆記」建立`);
    }

    let themeLink = "";
    if (this.themeName) {
      const themePath = findThemeNoteByName(notes, this.themeName);
      if (themePath) {
        themeLink = wikilinkFromPath(themePath);
      } else {
        themeLink = `[[${this.themeName}]]`;
        new Notice(`尚無「${this.themeName}」的題材筆記，建議先用「新增題材筆記」建立`);
      }
    }

    const content = `---
type: trade
date: ${this.date}
time: "${this.time}"
seq: ${seq}
ticker: "${this.ticker}"
name: ${displayName}
action: ${this.action}
qty: ${this.qty}
price: ${this.price}
fee: ${this.fee}
tax: ${this.tax}
stock: "${stockLink}"
theme: "${themeLink}"
created: "${taiwanNowString()}"
updated: ""
---

## ${actionLabel}原因

-

## 檢討

-
`;
    await createAndOpen(this.app, path, content);
    this.close();
  }
}

/** 用名稱+代號建立個股筆記（含 kline 區塊） */
export class NewStockNoteModal extends Modal {
  private ticker = "";
  private name = "";
  private themeNames = "";

  constructor(
    app: App,
    private plugin: InvRecordPlugin
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("新增個股筆記");
    const { contentEl } = this;
    new Setting(contentEl)
      .setName("代號")
      .setDesc("例如 2330、0050；上櫃請加 .TWO，例如 6488.TWO")
      .addText((t) =>
        t.setPlaceholder("2330").onChange((v) => (this.ticker = normalizeTicker(v)))
      );
    new Setting(contentEl).setName("名稱").addText((t) =>
      t.setPlaceholder("台積電").onChange((v) => (this.name = v.trim()))
    );
    new Setting(contentEl)
      .setName("題材")
      .setDesc("選填，一檔個股可橫跨多題材，逗號分隔；留空則不寫入 up:")
      .addText((t) =>
        t
          .setPlaceholder("AI 半導體, 先進封裝")
          .onChange((v) => (this.themeNames = v))
      );
    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("建立")
        .setCta()
        .onClick(() => void this.create())
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async create(): Promise<void> {
    if (!this.ticker) {
      new Notice("請填股票代號");
      return;
    }
    const s = this.plugin.settings;
    await ensureFolder(this.app, s.stocksFolder);
    const displayName = this.name || this.ticker;
    const path = normalizePath(
      `${s.stocksFolder}/${stockNoteBaseName(this.ticker, this.name)}.md`
    );
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice("這檔股票的筆記已存在");
      return;
    }

    // up: 支援多題材（一檔個股可橫跨多題材），只認既有題材筆記的檔名；
    // 找不到的題材仍會寫入連結，但另外提醒使用者建立，避免建檔流程被卡住。
    const themeNames = parseThemeNames(this.themeNames);
    const notes = listVaultNotes(this.app);
    const missing = themeNames.filter((n) => !findThemeNoteByName(notes, n));
    if (missing.length > 0) {
      new Notice(`尚無題材筆記：${missing.join("、")}，建議先用「新增題材筆記」建立`);
    }
    const upValue = buildUpFieldValue(themeNames);

    const content = `---
type: stock
ticker: "${this.ticker}"
name: ${displayName}
created: "${taiwanNowString()}"
updated: ""
up: ${upValue}
tags: [個股]
---

## K 線

\`\`\`kline
${this.ticker}
period: D
\`\`\`

## 投資邏輯

-

## 基本面檢視

-

## 關鍵交易復盤

> 精選復盤，完整清單見右側反向連結（Backlinks）。只記會改變論點的少數幾筆，附一行教訓。

-

## 風險

-
`;
    await createAndOpen(this.app, path, content);
    this.close();
  }
}

/** 建立總經筆記 */
export class NewMacroNoteModal extends Modal {
  private title = "";

  constructor(
    app: App,
    private plugin: InvRecordPlugin
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("新增總經筆記");
    const { contentEl } = this;
    new Setting(contentEl)
      .setName("標題")
      .setDesc("例如：2026-07 FED 利率決策")
      .addText((t) => t.onChange((v) => (this.title = v.trim())));
    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("建立")
        .setCta()
        .onClick(() => void this.create())
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async create(): Promise<void> {
    if (!this.title) {
      new Notice("請填標題");
      return;
    }
    const s = this.plugin.settings;
    await ensureFolder(this.app, s.macroFolder);
    const path = normalizePath(`${s.macroFolder}/${this.title}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice("同名筆記已存在");
      return;
    }
    const date = taiwanToday();
    const content = `---
type: macro
date: ${date}
created: "${taiwanNowString()}"
updated: ""
up: "[[總經 MOC]]"
tags: [總經]
---

## 事件 / 決策

-

## 對市場的影響

-

## 對我持股的影響

-
`;
    await createAndOpen(this.app, path, content);
    this.close();
  }
}

/** 建立題材筆記（總經 → 題材 → 個股 三層筆記法的中間層） */
export class NewThemeNoteModal extends Modal {
  private title = "";
  private macroName = "";

  constructor(
    app: App,
    private plugin: InvRecordPlugin
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("新增題材筆記");
    const { contentEl } = this;
    new Setting(contentEl)
      .setName("標題")
      .setDesc("例如：AI 半導體")
      .addText((t) => t.onChange((v) => (this.title = v.trim())));
    new Setting(contentEl)
      .setName("總經筆記")
      .setDesc("選填，連到相關的總經筆記；留空則不寫入 up:")
      .addText((t) =>
        t
          .setPlaceholder("2026-07 FED 利率決策")
          .onChange((v) => (this.macroName = v.trim()))
      );
    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("建立")
        .setCta()
        .onClick(() => void this.create())
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async create(): Promise<void> {
    if (!this.title) {
      new Notice("請填標題");
      return;
    }
    const s = this.plugin.settings;
    await ensureFolder(this.app, s.themeFolder);
    const path = normalizePath(`${s.themeFolder}/${this.title}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice("同名筆記已存在");
      return;
    }

    let upLink = "";
    if (this.macroName) {
      const notes = listVaultNotes(this.app);
      const macroPath = findNoteByTypeAndBasename(notes, "macro", this.macroName);
      if (macroPath) {
        upLink = wikilinkFromPath(macroPath);
      } else {
        upLink = `[[${this.macroName}]]`;
        new Notice(`尚無「${this.macroName}」的總經筆記，建議先用「新增總經筆記」建立`);
      }
    }

    const content = `---
type: theme
created: "${taiwanNowString()}"
updated: ""
up: "${upLink}"
tags: [題材]
---

> 相關個股請見右側反向連結（Backlinks）面板或 Local Graph，不需手動維護清單。

## 題材邏輯

-

## 風險

-
`;
    await createAndOpen(this.app, path, content);
    this.close();
  }
}
