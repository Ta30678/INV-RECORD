import { Chart, registerables, type ChartConfiguration } from "chart.js";
import { MarkdownRenderChild } from "obsidian";
import type InvRecordPlugin from "../main";
import type { ChartBlockParams } from "../types";

Chart.register(...registerables);

/**
 * 內建中性色盤（非紅漲綠跌——那是 K 線的慣例，見 docs/圖表語法.md）。
 * 經 dataviz 色盤驗證器確認：CVD 相鄰對比、明度帶、與深/淺底對比皆過關
 * （淺色三格 aqua/yellow/magenta 對比略低於 3:1，以圖例＋tooltip 直接標示緩解）。
 */
const PALETTE_LIGHT = [
  "#2a78d6",
  "#1baf7a",
  "#eda100",
  "#008300",
  "#4a3aa7",
  "#e34948",
  "#e87ba4",
  "#eb6834",
];
const PALETTE_DARK = [
  "#3987e5",
  "#199e70",
  "#c98500",
  "#008300",
  "#9085e9",
  "#e66767",
  "#d55181",
  "#d95926",
];

const NUMBER_FMT = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });

function formatValue(v: number, unit?: string): string {
  if (unit === "%") return `${v.toFixed(1)}%`;
  const s = NUMBER_FMT.format(v);
  return unit ? `${s} ${unit}` : s;
}

interface ThemeColors {
  text: string;
  muted: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
}

function isDarkTheme(): boolean {
  return document.body.classList.contains("theme-dark");
}

function readCssVar(el: HTMLElement, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v.length > 0 ? v : fallback;
}

function readTheme(el: HTMLElement): ThemeColors {
  const dark = isDarkTheme();
  return {
    text: readCssVar(el, "--text-normal", dark ? "#dcddde" : "#2e3338"),
    muted: readCssVar(el, "--text-muted", dark ? "#b3b3b3" : "#5c5c5c"),
    grid: readCssVar(
      el,
      "--background-modifier-border",
      dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"
    ),
    tooltipBg: dark ? "#252525" : "#ffffff",
    tooltipBorder: readCssVar(
      el,
      "--background-modifier-border",
      dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"
    ),
  };
}

function palette(): string[] {
  return isDarkTheme() ? PALETTE_DARK : PALETTE_LIGHT;
}

function colorAt(i: number, custom?: string[]): string {
  if (custom && custom.length > 0) return custom[i % custom.length];
  const p = palette();
  return p[i % p.length];
}

/**
 * Chart.js v4 的型別對「混合圖」（bar-line 雙軸雙型別 dataset）與
 * pie/doughnut 的資料形狀要求非常嚴格，動態依 invchart 參數組態時
 * 很難用單一型別滿足所有分支；此處以 `any` 建構物件，交由 Chart.js
 * 執行期驗證，呼叫 `new Chart()` 時再轉型為 `ChartConfiguration`。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildConfig(params: ChartBlockParams, theme: ThemeColors): any {
  const legendDisplay =
    params.type === "pie" || params.type === "donut" || params.series.length > 1;

  const basePlugins = {
    legend: {
      display: legendDisplay,
      labels: { color: theme.text, usePointStyle: true, boxWidth: 8 },
    },
    tooltip: {
      backgroundColor: theme.tooltipBg,
      titleColor: theme.text,
      bodyColor: theme.text,
      borderColor: theme.tooltipBorder,
      borderWidth: 1,
      padding: 8,
    },
  };

  // ── pie / donut ──
  if (params.type === "pie" || params.type === "donut") {
    const s = params.series[0];
    const bg = params.labels.map((_, i) => colorAt(i, params.colors));
    return {
      type: params.type === "donut" ? "doughnut" : "pie",
      data: {
        labels: params.labels,
        datasets: [
          {
            data: s.data,
            backgroundColor: bg,
            borderColor: theme.tooltipBg,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          ...basePlugins,
          tooltip: {
            ...basePlugins.tooltip,
            callbacks: {
              label: (ctx: { label?: string; parsed: unknown }) => {
                const v = typeof ctx.parsed === "number" ? ctx.parsed : 0;
                return `${ctx.label ?? ""}：${formatValue(v, params.unit)}`;
              },
            },
          },
        },
      },
    };
  }

  // ── bar / line / bar-line ──
  const isBarLine = params.type === "bar-line";
  const useRight = isBarLine && params.series.some((s) => s.yAxis === "right");

  const datasets = params.series.map((s, i) => {
    const color = colorAt(i, params.colors);
    const seriesType: "bar" | "line" = isBarLine
      ? (s.type ?? "bar")
      : (params.type as "bar" | "line");
    const unit = s.yAxis === "right" ? params.unitRight : params.unit;
    const common = {
      label: s.name,
      data: s.data,
      yAxisID: s.yAxis === "right" ? "y1" : "y",
      unit, // 自訂欄位，供 tooltip callback 讀取；Chart.js 不理會未知 key
    };
    if (seriesType === "bar") {
      return {
        ...common,
        type: isBarLine ? "bar" : undefined,
        backgroundColor: color,
        borderRadius: 4,
        maxBarThickness: 24,
        stack: params.stacked ? "stack0" : undefined,
      };
    }
    return {
      ...common,
      type: isBarLine ? "line" : undefined,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: color,
      tension: 0.25,
      fill: false,
    };
  });

  const valueAxis = {
    stacked: params.stacked,
    ticks: {
      color: theme.muted,
      callback: (v: number | string) => formatValue(Number(v), params.unit),
    },
    grid: { color: theme.grid },
    title: params.unit
      ? { display: true, text: params.unit, color: theme.muted }
      : undefined,
  };
  const categoryAxis = {
    stacked: params.stacked,
    ticks: { color: theme.muted },
    grid: { color: theme.grid, display: false },
  };

  const scales: Record<string, unknown> = params.horizontal
    ? { x: valueAxis, y: categoryAxis }
    : { x: categoryAxis, y: valueAxis };

  if (useRight) {
    scales.y1 = {
      position: "right",
      ticks: {
        color: theme.muted,
        callback: (v: number | string) => formatValue(Number(v), params.unitRight),
      },
      grid: { display: false },
      title: params.unitRight
        ? { display: true, text: params.unitRight, color: theme.muted }
        : undefined,
    };
  }

  return {
    type: isBarLine ? "bar" : params.type,
    data: { labels: params.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: params.horizontal ? "y" : "x",
      interaction: { mode: "index", intersect: false },
      scales,
      plugins: {
        ...basePlugins,
        tooltip: {
          ...basePlugins.tooltip,
          callbacks: {
            label: (ctx: {
              dataset: { label?: string; unit?: string };
              parsed: { x: number; y: number };
            }) => {
              const v = params.horizontal ? ctx.parsed.x : ctx.parsed.y;
              return `${ctx.dataset.label ?? ""}：${formatValue(Number(v), ctx.dataset.unit)}`;
            },
          },
        },
      },
    },
  };
}

export class ChartRenderChild extends MarkdownRenderChild {
  private chart: Chart | null = null;
  private rootEl!: HTMLElement;
  private canvasEl!: HTMLCanvasElement;

  constructor(
    containerEl: HTMLElement,
    private params: ChartBlockParams,
    private plugin: InvRecordPlugin
  ) {
    super(containerEl);
  }

  onload(): void {
    this.rootEl = this.containerEl.createDiv({ cls: "inv-chart" });
    this.rootEl.createDiv({ cls: "inv-chart-title", text: this.params.title });

    const wrap = this.rootEl.createDiv({ cls: "inv-chart-canvas-wrap" });
    wrap.style.height = `${this.params.height}px`;
    this.canvasEl = wrap.createEl("canvas");

    this.rootEl.createDiv({
      cls: "inv-chart-footer",
      text: `資料時點：${this.params.asOf}｜來源：${this.params.source}`,
    });

    this.renderChart();

    // 明暗主題切換時整張圖重新上色（配色與座標軸文字皆隨主題），同篇多區塊互不干擾
    this.registerEvent(
      this.plugin.app.workspace.on("css-change", () => this.renderChart())
    );
  }

  onunload(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private renderChart(): void {
    const ctx2d = this.canvasEl.getContext("2d");
    if (!ctx2d) return;
    this.chart?.destroy();
    const theme = readTheme(this.rootEl);
    const config = buildConfig(this.params, theme);
    this.chart = new Chart(ctx2d, config as ChartConfiguration);
  }
}
