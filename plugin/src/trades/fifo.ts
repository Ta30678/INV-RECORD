import type {
  FifoIssue,
  FifoResult,
  Lot,
  RealizedEvent,
  TradeRecord,
} from "../types";

/**
 * 純函式：FIFO 損益引擎。
 *
 * 規則（見 docs/資料格式.md）：
 * - 交易依 date → time → seq → 買進優先於賣出 → filePath 排序後依序處理
 * - 買進：手續費按股攤入成本，push 一個 lot
 * - 賣出：從最舊 lot 開始消耗；pnl = (price*qty − fee − tax) − Σ 消耗 lot 成本
 * - 超賣不做空：只實現持股可覆蓋的部分，其餘記 issue
 * - 當沖稅率減半不在 v1 範圍
 */
export function sortTrades(trades: TradeRecord[]): TradeRecord[] {
  return [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // 缺 time 者視為當日最晚（'99:99'），排在同日有 time 者之後；
    // 兩者都缺 time 時退回 seq（向下相容既有純 seq 排序的資料）。
    const at = a.time ?? "99:99";
    const bt = b.time ?? "99:99";
    if (at !== bt) return at < bt ? -1 : 1;
    if (a.seq !== b.seq) return a.seq - b.seq;
    // 同鍵（同日同時同 seq）時買進先於賣出：補登交易若沒填 time，
    // 這是唯一還原「先買後賣」真實順序的明確規則，取代原本仰賴
    // 檔名字典序（『買』< 『賣』）恰好正確的隱性行為。
    if (a.action !== b.action) return a.action === "buy" ? -1 : 1;
    return a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0;
  });
}

export function computeFifo(trades: TradeRecord[]): FifoResult {
  const openLots = new Map<string, Lot[]>();
  const names = new Map<string, string>();
  const realized: RealizedEvent[] = [];
  const issues: FifoIssue[] = [];

  for (const t of sortTrades(trades)) {
    if (t.name) names.set(t.ticker, t.name);
    const lots = openLots.get(t.ticker) ?? [];

    if (t.action === "buy") {
      lots.push({
        date: t.date,
        qty: t.qty,
        costPerShare: (t.price * t.qty + t.fee + t.tax) / t.qty,
        sourcePath: t.filePath,
      });
      openLots.set(t.ticker, lots);
      continue;
    }

    // sell
    const held = lots.reduce((s, l) => s + l.qty, 0);
    let sellQty = t.qty;
    if (sellQty > held) {
      issues.push({
        filePath: t.filePath,
        message: `賣出 ${t.qty} 股但僅持有 ${held} 股（${t.ticker}），僅計算可覆蓋部分，不做空`,
      });
      sellQty = held;
    }
    if (sellQty === 0) {
      openLots.set(t.ticker, lots);
      continue;
    }

    // 賣出費稅按實際實現股數比例分攤（超賣時只攤可覆蓋部分）
    const feeTaxPerShare = (t.fee + t.tax) / t.qty;
    let remaining = sellQty;
    let costBasis = 0;
    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(lot.qty, remaining);
      costBasis += take * lot.costPerShare;
      lot.qty -= take;
      remaining -= take;
      if (lot.qty === 0) lots.shift();
    }

    const proceeds = t.price * sellQty - feeTaxPerShare * sellQty;
    realized.push({
      date: t.date,
      ticker: t.ticker,
      name: names.get(t.ticker) ?? t.ticker,
      qty: sellQty,
      sellPrice: t.price,
      proceeds,
      costBasis,
      pnl: proceeds - costBasis,
      sourcePath: t.filePath,
    });
    openLots.set(t.ticker, lots);
  }

  // 移除已全平的 ticker，儀表板不用再過濾
  for (const [ticker, lots] of openLots) {
    if (lots.length === 0) openLots.delete(ticker);
  }

  return { realized, openLots, names, issues };
}
