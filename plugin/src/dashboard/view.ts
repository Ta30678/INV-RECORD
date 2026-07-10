import { ItemView, type WorkspaceLeaf } from "obsidian";
import type InvRecordPlugin from "../main";
import {
  buildPositions,
  realizedThisYear,
  summarizeRealized,
} from "../trades/portfolio";
import type { Position } from "../types";

export const DASHBOARD_VIEW_TYPE = "inv-record-dashboard";

const fmtInt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const fmtPrice = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function money(n: number): string {
  return fmtInt.format(Math.round(n));
}

function signed(n: number): string {
  return (n >= 0 ? "+" : "") + money(n);
}

function pct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

/** 台式：正數紅、負數綠（設定可切美式） */
function pnlClass(n: number | null, taiwanColors: boolean): string {
  if (n === null || n === 0) return "";
  const positive = n > 0;
  return positive === taiwanColors ? "inv-up" : "inv-down";
}

export class DashboardView extends ItemView {
  private quotes = new Map<string, number>();
  private quoteStale = false;
  private quoteError: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: InvRecordPlugin
  ) {
    super(leaf);
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "績效儀表板";
  }

  getIcon(): string {
    return "line-chart";
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.plugin.tradeStore.subscribe(() => {
      void this.refreshQuotes();
    });
    await this.refreshQuotes();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async refreshQuotes(): Promise<void> {
    this.render(); // 先用既有報價畫一次，避免等待網路
    const tickers = this.plugin.tradeStore.tickersToQuote();
    this.quoteError = null;
    this.quoteStale = false;
    const results = await Promise.allSettled(
      tickers.map(async (t) => {
        const q = await this.plugin.yahoo.getQuote(t);
        return { ticker: t, ...q };
      })
    );
    let failures = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.price !== null) this.quotes.set(r.value.ticker, r.value.price);
        if (r.value.stale) this.quoteStale = true;
      } else {
        failures++;
      }
    }
    if (failures > 0) {
      this.quoteError = `有 ${failures} 檔股票報價取得失敗`;
    }
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("inv-dashboard");
    const s = this.plugin.settings;
    const store = this.plugin.tradeStore;
    const positions = buildPositions(store.fifo, this.quotes);

    // ── 標題列 ──
    const header = container.createDiv({ cls: "inv-dash-header" });
    header.createEl("h4", { text: "績效儀表板" });
    const refreshBtn = header.createEl("button", {
      cls: "inv-dash-refresh",
      text: "⟳ 更新報價",
    });
    refreshBtn.addEventListener("click", () => {
      this.plugin.yahoo.clearCache();
      void this.refreshQuotes();
    });

    // ── 摘要卡 ──
    const totalValue = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
    const totalUnrealized = positions.reduce(
      (sum, p) => sum + (p.unrealizedPnl ?? 0),
      0
    );
    const today = new Date().toISOString().slice(0, 10);
    const yearRealized = realizedThisYear(store.fifo.realized, today);

    const cards = container.createDiv({ cls: "inv-dash-cards" });
    this.card(cards, "總市值", money(totalValue), "");
    this.card(cards, "未實現損益", signed(totalUnrealized), pnlClass(totalUnrealized, s.taiwanColors));
    this.card(cards, "今年已實現", signed(yearRealized), pnlClass(yearRealized, s.taiwanColors));

    // ── 持倉表 ──
    container.createEl("h5", { text: `持倉（${positions.length}）` });
    if (positions.length === 0) {
      container.createDiv({
        cls: "inv-dash-empty",
        text: "目前沒有持倉。用指令「INV Record: 新增交易紀錄」記下第一筆交易。",
      });
    } else {
      this.positionsTable(container, positions, s.taiwanColors);
    }

    // ── 已實現月度表 ──
    const monthly = summarizeRealized(store.fifo.realized, "month");
    container.createEl("h5", { text: "已實現損益（月）" });
    if (monthly.length === 0) {
      container.createDiv({ cls: "inv-dash-empty", text: "尚無已實現損益。" });
    } else {
      const table = container.createEl("table", { cls: "inv-dash-table" });
      const thead = table.createEl("thead").createEl("tr");
      for (const h of ["月份", "損益", "報酬率"]) thead.createEl("th", { text: h });
      const tbody = table.createEl("tbody");
      for (const row of monthly) {
        const tr = tbody.createEl("tr");
        tr.createEl("td", { text: row.period });
        tr.createEl("td", {
          text: signed(row.pnl),
          cls: pnlClass(row.pnl, s.taiwanColors),
        });
        tr.createEl("td", {
          text: row.returnPct !== null ? pct(row.returnPct) : "—",
          cls: pnlClass(row.returnPct, s.taiwanColors),
        });
      }
    }

    // ── 警告區 ──
    const warnings: string[] = [];
    if (this.quoteStale) warnings.push("部分報價來自快取（Yahoo 連線失敗）");
    if (this.quoteError) warnings.push(this.quoteError);
    for (const i of store.parseIssues) warnings.push(`${i.filePath}：${i.message}`);
    for (const i of store.fifo.issues) warnings.push(`${i.filePath}：${i.message}`);
    if (warnings.length > 0) {
      const warnEl = container.createDiv({ cls: "inv-dash-warnings" });
      warnEl.createEl("strong", { text: "⚠ 資料警告" });
      const ul = warnEl.createEl("ul");
      for (const w of warnings) ul.createEl("li", { text: w });
    }
  }

  private card(parent: HTMLElement, label: string, value: string, cls: string): void {
    const card = parent.createDiv({ cls: "inv-dash-card" });
    card.createDiv({ cls: "inv-dash-card-label", text: label });
    card.createDiv({ cls: `inv-dash-card-value ${cls}`.trim(), text: value });
  }

  private positionsTable(
    parent: HTMLElement,
    positions: Position[],
    taiwanColors: boolean
  ): void {
    const wrapper = parent.createDiv({ cls: "inv-dash-table-wrap" });
    const table = wrapper.createEl("table", { cls: "inv-dash-table" });
    const thead = table.createEl("thead").createEl("tr");
    for (const h of ["股票", "股數", "均價", "現價", "未實現", "%"]) {
      thead.createEl("th", { text: h });
    }
    const tbody = table.createEl("tbody");
    for (const p of positions) {
      const tr = tbody.createEl("tr");
      tr.createEl("td", { text: `${p.ticker} ${p.name !== p.ticker ? p.name : ""}`.trim() });
      tr.createEl("td", { text: fmtInt.format(p.qty) });
      tr.createEl("td", { text: fmtPrice.format(p.avgCost) });
      tr.createEl("td", {
        text: p.lastPrice !== null ? fmtPrice.format(p.lastPrice) : "—",
      });
      tr.createEl("td", {
        text: p.unrealizedPnl !== null ? signed(p.unrealizedPnl) : "—",
        cls: pnlClass(p.unrealizedPnl, taiwanColors),
      });
      tr.createEl("td", {
        text: p.unrealizedPct !== null ? pct(p.unrealizedPct) : "—",
        cls: pnlClass(p.unrealizedPct, taiwanColors),
      });
    }
  }
}
