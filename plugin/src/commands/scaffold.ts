import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type InvRecordPlugin from "../main";
import { estimateFee, estimateTax, type FeeSettings } from "../trades/fees";
import { normalizeTicker } from "../yahoo/parse";

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

/** 新增交易紀錄的輸入 Modal：自動試算手續費與證交稅。 */
export class NewTradeModal extends Modal {
  private date = new Date().toISOString().slice(0, 10);
  private ticker = "";
  private name = "";
  private action: "buy" | "sell" = "buy";
  private qty = 1000;
  private price = 0;
  private fee = 0;
  private tax = 0;
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
      minFee: 20,
    };
  }

  /** 使用者沒手動改過費用時，隨股數/價格重算 */
  private recalcFees(): void {
    if (!this.feeTouched) {
      this.fee = estimateFee(this.qty, this.price, this.feeSettings());
      if (this.feeInput) this.feeInput.value = String(this.fee);
    }
    if (!this.taxTouched) {
      this.tax = estimateTax(this.qty, this.price, this.action, this.feeSettings());
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
      .setName("代號")
      .setDesc("例如 2330、0050")
      .addText((t) =>
        t.setPlaceholder("2330").onChange((v) => (this.ticker = normalizeTicker(v)))
      );

    new Setting(contentEl).setName("名稱").addText((t) =>
      t.setPlaceholder("台積電").onChange((v) => (this.name = v.trim()))
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
    const stockLink = `[[${displayName} ${this.ticker}]]`;
    const content = `---
type: trade
date: ${this.date}
seq: ${seq}
ticker: "${this.ticker}"
name: ${displayName}
action: ${this.action}
qty: ${this.qty}
price: ${this.price}
fee: ${this.fee}
tax: ${this.tax}
stock: "${stockLink}"
theme: ""
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

  constructor(
    app: App,
    private plugin: InvRecordPlugin
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("新增個股筆記");
    const { contentEl } = this;
    new Setting(contentEl).setName("代號").addText((t) =>
      t.setPlaceholder("2330").onChange((v) => (this.ticker = normalizeTicker(v)))
    );
    new Setting(contentEl).setName("名稱").addText((t) =>
      t.setPlaceholder("台積電").onChange((v) => (this.name = v.trim()))
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
    const path = normalizePath(`${s.stocksFolder}/${displayName} ${this.ticker}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice("這檔股票的筆記已存在");
      return;
    }
    const content = `---
type: stock
ticker: "${this.ticker}"
name: ${displayName}
up: ""
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
    const date = new Date().toISOString().slice(0, 10);
    const content = `---
type: macro
date: ${date}
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
