import { ItemView, type WorkspaceLeaf } from "obsidian";
import { listVaultNotes } from "../commands/scaffold";
import type InvRecordPlugin from "../main";
import { findStockNoteByTicker } from "../trades/noteLinks";
import {
  buildPositions,
  dashboardRangeLabel,
  filterRealizedByRange,
  resolveDashboardRange,
  summarizeRealized,
  summarizeRealizedByTicker,
  summarizeRealizedTotals,
  totalInvestedCost,
  type DashboardRangeKey,
} from "../trades/portfolio";
import type { Position, RealizedByTickerRow } from "../types";
import {
  formatTaiwanDateTime,
  formatTaiwanDateTimeShort,
  taiwanToday,
} from "../utils/time";

export const DASHBOARD_VIEW_TYPE = "inv-record-dashboard";

const RANGE_KEYS: DashboardRangeKey[] = [
  "thisMonth",
  "lastMonth",
  "thisYear",
  "last365",
  "all",
];

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
  /** 本輪抓取完成的本機時間（epoch ms）；未實現損益等即時數字要有時間戳才可信。 */
  private lastRefreshAt: number | null = null;
  /** stale 報價中最舊的抓取時間；讓使用者判斷快取警告的嚴重程度。 */
  private oldestStaleFetchedAt: number | null = null;
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
    this.oldestStaleFetchedAt = null;
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
        if (r.value.stale) {
          this.quoteStale = true;
          if (
            this.oldestStaleFetchedAt === null ||
            r.value.fetchedAt < this.oldestStaleFetchedAt
          ) {
            this.oldestStaleFetchedAt = r.value.fetchedAt;
          }
        }
      } else {
        failures++;
      }
    }
    if (failures > 0) {
      this.quoteError = `有 ${failures} 檔股票報價取得失敗`;
    }
    this.lastRefreshAt = Date.now();
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

    if (this.lastRefreshAt !== null) {
      container.createDiv({
        cls: "inv-dash-meta",
        text: `報價更新於 ${formatTaiwanDateTime(this.lastRefreshAt)}`,
      });
    }

    // ── 時間範圍選擇（只約束已實現指標，見下方持倉表附註） ──
    const today = taiwanToday();
    const rangeKey = s.dashboardRange;
    const range = resolveDashboardRange(rangeKey, today);
    const periodRealized = filterRealizedByRange(
      store.fifo.realized,
      range.from,
      range.to
    );
    const periodTotals = summarizeRealizedTotals(periodRealized);
    const rangeLabel = dashboardRangeLabel(rangeKey);

    const rangeBar = container.createDiv({ cls: "inv-dash-range" });
    for (const key of RANGE_KEYS) {
      const btn = rangeBar.createEl("button", {
        cls: "inv-dash-range-btn",
        text: dashboardRangeLabel(key),
      });
      btn.toggleClass("is-active", key === rangeKey);
      btn.addEventListener("click", () => {
        if (s.dashboardRange === key) return;
        s.dashboardRange = key;
        void this.plugin.saveSettings();
        this.render();
      });
    }

    // ── 摘要卡 ──
    const totalValue = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
    const totalUnrealized = positions.reduce(
      (sum, p) => sum + (p.unrealizedPnl ?? 0),
      0
    );
    const totalCost = positions.reduce((sum, p) => sum + p.totalCost, 0);
    const unrealizedPct = totalCost > 0 ? (totalUnrealized / totalCost) * 100 : null;

    const cards = container.createDiv({ cls: "inv-dash-cards" });
    this.card(cards, "總市值", money(totalValue), "");
    this.card(
      cards,
      "未實現損益",
      signed(totalUnrealized),
      pnlClass(totalUnrealized, s.taiwanColors),
      unrealizedPct !== null ? pct(unrealizedPct) : "—"
    );
    this.card(
      cards,
      `已實現損益（${rangeLabel}）`,
      signed(periodTotals.pnl),
      pnlClass(periodTotals.pnl, s.taiwanColors),
      periodTotals.returnPct !== null ? pct(periodTotals.returnPct) : "—"
    );

    if (rangeKey === "all") {
      // 「全部」時分子（累計已實現＋目前未實現）與分母（累計買進投入成本）口徑
      // 天然一致，不需歷史估值，是唯一誠實的合併 ROI（見 v1.1 決策備忘）。
      const invested = totalInvestedCost(store.trades);
      const totalPnl = periodTotals.pnl + totalUnrealized;
      const totalReturnPct = invested > 0 ? (totalPnl / invested) * 100 : null;
      this.card(
        cards,
        "總績效（成立以來）",
        totalReturnPct !== null ? pct(totalReturnPct) : "—",
        pnlClass(totalReturnPct, s.taiwanColors)
      );
    } else {
      this.card(cards, "總績效（成立以來）", "—（僅適用於全部期間）", "");
    }

    // ── 持倉表（快照，不受時間範圍影響） ──
    container.createEl("h5", {
      text: `目前持倉（以最新報價計，不受上方期間影響；共 ${positions.length} 檔）`,
    });
    if (positions.length === 0) {
      container.createDiv({
        cls: "inv-dash-empty",
        text: "目前沒有持倉。用指令「INV Record: 新增交易紀錄」記下第一筆交易。",
      });
    } else {
      this.positionsTable(container, positions, s.taiwanColors);
    }

    // ── 已實現月度表（受範圍約束，只列範圍內月份） ──
    const monthly = summarizeRealized(periodRealized, "month");
    container.createEl("h5", { text: `已實現損益月彙總（${rangeLabel}）` });
    if (monthly.length === 0) {
      container.createDiv({ cls: "inv-dash-empty", text: "此期間尚無已實現損益。" });
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

    // ── 個股別已實現明細（受範圍約束） ──
    const byTicker = summarizeRealizedByTicker(periodRealized);
    container.createEl("h5", { text: `個股別已實現明細（${rangeLabel}）` });
    if (byTicker.length === 0) {
      container.createDiv({ cls: "inv-dash-empty", text: "此期間尚無已實現損益。" });
    } else {
      this.byTickerTable(container, byTicker, s.taiwanColors);
    }

    // ── 警告區 ──
    const warnings: string[] = [];
    if (this.quoteStale) {
      const age =
        this.oldestStaleFetchedAt !== null
          ? `（最舊為 ${formatTaiwanDateTimeShort(this.oldestStaleFetchedAt)} 抓取）`
          : "";
      warnings.push(`部分報價來自快取${age}`);
    }
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

  private card(
    parent: HTMLElement,
    label: string,
    value: string,
    cls: string,
    sub?: string
  ): void {
    const card = parent.createDiv({ cls: "inv-dash-card" });
    card.createDiv({ cls: "inv-dash-card-label", text: label });
    card.createDiv({ cls: `inv-dash-card-value ${cls}`.trim(), text: value });
    if (sub !== undefined) {
      card.createDiv({ cls: `inv-dash-card-sub ${cls}`.trim(), text: sub });
    }
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

  /**
   * 個股別已實現損益明細。個股欄若能在 vault 中找到對應的 type:stock 筆記
   * （依 ticker 反查，不硬拼檔名），做成可點擊連結；找不到則顯示純文字。
   */
  private byTickerTable(
    parent: HTMLElement,
    rows: RealizedByTickerRow[],
    taiwanColors: boolean
  ): void {
    const notes = listVaultNotes(this.app);
    const wrapper = parent.createDiv({ cls: "inv-dash-table-wrap" });
    const table = wrapper.createEl("table", { cls: "inv-dash-table" });
    const thead = table.createEl("thead").createEl("tr");
    for (const h of ["個股", "賣出筆數", "已實現損益", "報酬率", "勝率", "平均持有天數"]) {
      thead.createEl("th", { text: h });
    }
    const tbody = table.createEl("tbody");
    for (const r of rows) {
      const tr = tbody.createEl("tr");
      const tickerTd = tr.createEl("td");
      const label = `${r.ticker}${r.name !== r.ticker ? " " + r.name : ""}`;
      const notePath = findStockNoteByTicker(notes, r.ticker);
      if (notePath !== null) {
        const link = tickerTd.createEl("a", { cls: "internal-link", text: label });
        link.addEventListener("click", (ev) => {
          ev.preventDefault();
          void this.app.workspace.openLinkText(notePath, "");
        });
      } else {
        tickerTd.setText(label);
      }
      tr.createEl("td", { text: fmtInt.format(r.sellCount) });
      tr.createEl("td", {
        text: signed(r.pnl),
        cls: pnlClass(r.pnl, taiwanColors),
      });
      tr.createEl("td", {
        text: r.returnPct !== null ? pct(r.returnPct) : "—",
        cls: pnlClass(r.returnPct, taiwanColors),
      });
      tr.createEl("td", { text: `${r.winRate.toFixed(0)}%` });
      tr.createEl("td", { text: `${r.avgHoldingDays.toFixed(1)} 天` });
    }
  }
}
