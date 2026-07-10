import type {
  FifoResult,
  Position,
  RealizedEvent,
  RealizedSummaryRow,
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

/** 今年已實現損益（儀表板摘要卡用） */
export function realizedThisYear(realized: RealizedEvent[], today: string): number {
  const year = today.slice(0, 4);
  return realized
    .filter((r) => r.date.startsWith(year))
    .reduce((s, r) => s + r.pnl, 0);
}
