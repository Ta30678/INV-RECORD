import { MarkdownRenderChild } from "obsidian";
import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
// 注意：lightweight-charts v5 的 API 是 chart.addSeries(CandlestickSeries, opts)，
// 與 v4 的 chart.addCandlestickSeries(opts) 不同；本專案 pin ^5.2。
import type InvRecordPlugin from "../main";
import type { ChartData, KlineParams, KlinePeriod } from "../types";
import { periodLabel, periodToInterval } from "./blockParams";

interface ThemeColors {
  text: string;
  grid: string;
  border: string;
  up: string;
  down: string;
}

function themeColors(taiwanColors: boolean): ThemeColors {
  const dark = document.body.classList.contains("theme-dark");
  // 台式紅漲綠跌；美式相反
  const red = "#d6453f";
  const green = "#1f9d55";
  return {
    text: dark ? "#b3b3b3" : "#5c5c5c",
    grid: dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
    border: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)",
    up: taiwanColors ? red : green,
    down: taiwanColors ? green : red,
  };
}

export class KlineRenderChild extends MarkdownRenderChild {
  private chart: IChartApi | null = null;
  private candles: ISeriesApi<"Candlestick"> | null = null;
  private volume: ISeriesApi<"Histogram"> | null = null;
  private period: KlinePeriod;
  private headerEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private chartEl!: HTMLElement;
  private periodButtons = new Map<KlinePeriod, HTMLButtonElement>();

  constructor(
    containerEl: HTMLElement,
    private params: KlineParams,
    private plugin: InvRecordPlugin
  ) {
    super(containerEl);
    this.period = params.period;
  }

  onload(): void {
    const root = this.containerEl.createDiv({ cls: "inv-kline" });

    this.headerEl = root.createDiv({ cls: "inv-kline-header" });
    const titleEl = this.headerEl.createDiv({
      cls: "inv-kline-title",
      text: this.params.ticker,
    });
    titleEl.setAttr("data-ticker", this.params.ticker);

    const controls = this.headerEl.createDiv({ cls: "inv-kline-controls" });
    for (const p of ["D", "W", "M"] as KlinePeriod[]) {
      const btn = controls.createEl("button", {
        cls: "inv-kline-period",
        text: periodLabel(p),
      });
      btn.addEventListener("click", () => {
        if (this.period === p) return;
        this.period = p;
        void this.refresh(false);
      });
      this.periodButtons.set(p, btn);
    }
    const refreshBtn = controls.createEl("button", {
      cls: "inv-kline-refresh",
      text: "⟳",
      attr: { "aria-label": "重新整理報價" },
    });
    refreshBtn.addEventListener("click", () => void this.refresh(true));

    this.statusEl = root.createDiv({ cls: "inv-kline-status" });
    this.chartEl = root.createDiv({ cls: "inv-kline-chart" });

    // 明暗主題切換時重新上色
    this.registerEvent(
      this.plugin.app.workspace.on("css-change", () => this.applyTheme())
    );

    void this.refresh(false);
  }

  onunload(): void {
    this.destroyChart();
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
      this.candles = null;
      this.volume = null;
    }
  }

  private setStatus(text: string, isError = false): void {
    this.statusEl.setText(text);
    this.statusEl.toggleClass("inv-kline-error", isError);
  }

  private async refresh(force: boolean): Promise<void> {
    for (const [p, btn] of this.periodButtons) {
      btn.toggleClass("is-active", p === this.period);
    }
    this.setStatus("載入中…");
    if (force) this.plugin.yahoo.clearCache();

    const range = this.params.range ?? this.plugin.settings.defaultRange;
    try {
      const { data, stale } = await this.plugin.yahoo.getChart(
        this.params.ticker,
        { interval: periodToInterval(this.period), range }
      );
      this.renderChart(data);
      this.updateTitle(data);
      this.setStatus(stale ? "⚠ 無法連上 Yahoo，顯示上次快取資料" : "");
    } catch (e) {
      this.destroyChart();
      this.setStatus(
        `無法取得 ${this.params.ticker} 的資料：${e instanceof Error ? e.message : String(e)}`,
        true
      );
    }
  }

  private updateTitle(data: ChartData): void {
    const name = data.meta.shortName ?? "";
    const range = this.params.range ?? this.plugin.settings.defaultRange;
    const title = this.headerEl.querySelector(".inv-kline-title");
    if (title) {
      title.setText(
        `${this.params.ticker} ${name} · ${periodLabel(this.period)} · ${range}`
      );
    }
  }

  private renderChart(data: ChartData): void {
    const colors = themeColors(this.plugin.settings.taiwanColors);
    if (!this.chart) {
      this.chart = createChart(this.chartEl, {
        autoSize: true,
        layout: {
          background: { color: "transparent" },
          textColor: colors.text,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: colors.grid },
          horzLines: { color: colors.grid },
        },
        rightPriceScale: { borderColor: colors.border },
        timeScale: { borderColor: colors.border },
      });
      this.candles = this.chart.addSeries(CandlestickSeries, {});
      this.volume = this.chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
      });
      this.chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
    }

    this.applySeriesColors(colors);
    this.candles!.setData(
      data.bars.map((b) => ({
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    );
    this.volume!.setData(
      data.bars.map((b) => ({
        time: b.time,
        value: b.volume,
        color:
          b.close >= b.open
            ? `${colors.up}66` // 帶透明度
            : `${colors.down}66`,
      }))
    );
    this.chart.timeScale().fitContent();
  }

  private applySeriesColors(colors: ThemeColors): void {
    this.candles?.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
  }

  private applyTheme(): void {
    if (!this.chart) return;
    const colors = themeColors(this.plugin.settings.taiwanColors);
    this.chart.applyOptions({
      layout: { background: { color: "transparent" }, textColor: colors.text },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
    });
    this.applySeriesColors(colors);
  }
}
