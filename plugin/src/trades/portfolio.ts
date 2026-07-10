import type {
  FifoResult,
  Position,
  RealizedByTickerRow,
  RealizedEvent,
  RealizedSummaryRow,
  TradeRecord,
} from "../types";

/** 純函式：持倉彙總與期間已實現報酬。 */

export function buildPositions(
  fifo: FifoResult,
  quotes: Map<string, number>
): Position[] {
  const positions: Position[] = [];
  for (const [ticker, lots] of fifo.openLots) {
    const qty = lots.reduce((s, l) => s + l.qty, 0);
    if (qty <= 0) continue;
    const totalCost = lots.reduce((s, l) => s + l.qty * l.costPerShare, 0);
    const avgCost = totalCost / qty;
    const lastPrice = quotes.get(ticker) ?? null;
    const marketValue = lastPrice !== null ? lastPrice * qty : null;
    const unrealizedPnl = marketValue !== null ? marketValue - totalCost : null;
    positions.push({
      ticker,
      name: fifo.names.get(ticker) ?? ticker,
      qty,
      avgCost,
      totalCost,
      lastPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPct:
        unrealizedPnl !== null && totalCost > 0
          ? (unrealizedPnl / totalCost) * 100
          : null,
    });
  }
  positions.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return positions;
}

export type SummaryPeriod = "month" | "year" | "all";

function periodKey(date: string, period: SummaryPeriod): string {
  switch (period) {
    case "month":
      return date.slice(0, 7);
    case "year":
      return date.slice(0, 4);
    case "all":
      return "全部";
  }
}

/**
 * 期間報酬定義（v1）：期內已實現損益 ÷ 期內平倉成本。
 * 未實現損益不併入（另列於持倉表）。
 */
export function summarizeRealized(
  realized: RealizedEvent[],
  period: SummaryPeriod
): RealizedSummaryRow[] {
  const buckets = new Map<string, { pnl: number; costBasis: number }>();
  for (const r of realized) {
    const key = periodKey(r.date, period);
    const b = buckets.get(key) ?? { pnl: 0, costBasis: 0 };
    b.pnl += r.pnl;
    b.costBasis += r.costBasis;
    buckets.set(key, b);
  }
  const rows: RealizedSummaryRow[] = [];
  for (const [key, b] of buckets) {
    rows.push({
      period: key,
      pnl: b.pnl,
      costBasis: b.costBasis,
      returnPct: b.costBasis > 0 ? (b.pnl / b.costBasis) * 100 : null,
    });
  }
  rows.sort((a, b) => b.period.localeCompare(a.period)); // 新的在前
  return rows;
}

/** 純函式：以 'YYYY-MM-DD' 字串比較過濾已實現事件（含頭尾；from/to 缺省=不限）。 */
export function filterRealizedByRange(
  realized: RealizedEvent[],
  from?: string,
  to?: string
): RealizedEvent[] {
  return realized.filter((r) => {
    if (from !== undefined && r.date < from) return false;
    if (to !== undefined && r.date > to) return false;
    return true;
  });
}

export interface RealizedTotals {
  pnl: number;
  costBasis: number;
  /** 期內已實現損益 ÷ 期內平倉成本；costBasis 為 0 時為 null */
  returnPct: number | null;
}

/**
 * 單一區間已實現損益合計（摘要卡用）。呼叫端應先用 filterRealizedByRange 過濾
 * 好要納入的區間——此函式本身不知道「範圍」的概念，只負責加總。
 */
export function summarizeRealizedTotals(realized: RealizedEvent[]): RealizedTotals {
  const pnl = realized.reduce((s, r) => s + r.pnl, 0);
  const costBasis = realized.reduce((s, r) => s + r.costBasis, 0);
  return {
    pnl,
    costBasis,
    returnPct: costBasis > 0 ? (pnl / costBasis) * 100 : null,
  };
}

/**
 * 個股別已實現損益明細（儀表板用）。呼叫端一樣要先過濾範圍再傳入。
 * 依已實現損益（pnl）由大到小排序；avgHoldingDays 依各筆賣出消耗股數加權平均。
 */
export function summarizeRealizedByTicker(
  realized: RealizedEvent[]
): RealizedByTickerRow[] {
  interface Bucket {
    name: string;
    pnl: number;
    costBasis: number;
    sellCount: number;
    wins: number;
    weightedDays: number;
    qty: number;
  }
  const buckets = new Map<string, Bucket>();
  for (const r of realized) {
    const b = buckets.get(r.ticker) ?? {
      name: r.name,
      pnl: 0,
      costBasis: 0,
      sellCount: 0,
      wins: 0,
      weightedDays: 0,
      qty: 0,
    };
    b.pnl += r.pnl;
    b.costBasis += r.costBasis;
    b.sellCount += 1;
    if (r.pnl > 0) b.wins += 1;
    b.weightedDays += r.avgHoldingDays * r.qty;
    b.qty += r.qty;
    buckets.set(r.ticker, b);
  }
  const rows: RealizedByTickerRow[] = [];
  for (const [ticker, b] of buckets) {
    rows.push({
      ticker,
      name: b.name,
      sellCount: b.sellCount,
      pnl: b.pnl,
      costBasis: b.costBasis,
      returnPct: b.costBasis > 0 ? (b.pnl / b.costBasis) * 100 : null,
      winRate: b.sellCount > 0 ? (b.wins / b.sellCount) * 100 : 0,
      avgHoldingDays: b.qty > 0 ? b.weightedDays / b.qty : 0,
    });
  }
  rows.sort((a, b) => b.pnl - a.pnl);
  return rows;
}

/**
 * 累計買進投入成本（成立以來總績效的分母）：所有買進交易的成交金額 + 手續費（+ 稅，
 * 買進通常為 0）加總。刻意用「所有買進」而非「目前持倉成本」——已平倉又再買回的部位
 * 仍應計入投入本金，這是無出入金台帳限制下唯一誠實的分母（賣出後再投入會墊高分母，
 * 為保守估計，見 v1.1 決策備忘）。
 */
export function totalInvestedCost(trades: TradeRecord[]): number {
  return trades
    .filter((t) => t.action === "buy")
    .reduce((s, t) => s + t.price * t.qty + t.fee + t.tax, 0);
}

/** 儀表板時間範圍五檔預設選項。K 線的 KlineRange 是「圖表回看窗」，這裡是「會計期間」，語意不同，刻意不共用詞彙。 */
export type DashboardRangeKey = "thisMonth" | "lastMonth" | "thisYear" | "last365" | "all";

const DASHBOARD_RANGE_LABELS: Record<DashboardRangeKey, string> = {
  thisMonth: "本月",
  lastMonth: "上月",
  thisYear: "今年",
  last365: "近一年",
  all: "全部",
};

export function dashboardRangeLabel(key: DashboardRangeKey): string {
  return DASHBOARD_RANGE_LABELS[key];
}

export interface DateRange {
  from?: string;
  to?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 'YYYY-MM-DD' → UTC epoch day（純日期字串，Date.parse 視為 UTC 午夜）。 */
function epochDayFromDateString(date: string): number {
  return Math.floor(Date.parse(date) / 86_400_000);
}

function dateStringFromEpochDay(day: number): string {
  const d = new Date(day * 86_400_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * 五檔時間範圍選項 → (from, to) 起訖日期（皆為 'YYYY-MM-DD'，含頭尾）。
 * 「今年」一律是曆年（1/1 起，不是 rolling 12 個月）；「近一年」= rolling 365 天
 * （含今天，往前數 364 天，共 365 天）。「全部」回傳 {}（不過濾）。
 * today 由呼叫端傳入（一律用 taiwanToday()），此函式本身不碰「現在」。
 */
export function resolveDashboardRange(
  key: DashboardRangeKey,
  today: string
): DateRange {
  const [y, m] = today.split("-").map(Number);
  switch (key) {
    case "thisMonth":
      return { from: `${y}-${pad2(m)}-01`, to: today };
    case "lastMonth": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      return {
        from: `${py}-${pad2(pm)}-01`,
        to: `${py}-${pad2(pm)}-${pad2(lastDay)}`,
      };
    }
    case "thisYear":
      return { from: `${y}-01-01`, to: today };
    case "last365":
      return {
        from: dateStringFromEpochDay(epochDayFromDateString(today) - 364),
        to: today,
      };
    case "all":
      return {};
  }
}
