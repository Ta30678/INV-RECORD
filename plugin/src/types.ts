/** 一根 K 棒（time 為台灣交易日 'YYYY-MM-DD'） */
export interface OhlcBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Yahoo chart 回應中的即時報價摘要 */
export interface QuoteMeta {
  symbol: string;
  regularMarketPrice: number | null;
  previousClose: number | null;
  currency: string | null;
  shortName: string | null;
}

export interface ChartData {
  bars: OhlcBar[];
  meta: QuoteMeta;
}

export type KlinePeriod = "D" | "W" | "M";
export type KlineRange = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "max";

export interface KlineParams {
  ticker: string;
  period: KlinePeriod;
  range: KlineRange | null; // null → 使用外掛設定的預設值
}

export type TradeAction = "buy" | "sell";

/** 由交易筆記 frontmatter 解析出的一筆交易 */
export interface TradeRecord {
  filePath: string;
  date: string; // YYYY-MM-DD
  seq: number;
  ticker: string;
  name: string;
  action: TradeAction;
  qty: number;
  price: number;
  fee: number;
  tax: number;
}

export interface ParseIssue {
  filePath: string;
  message: string;
}

/** FIFO 中尚未賣出的一批持股 */
export interface Lot {
  date: string;
  qty: number;
  /** 每股成本（含攤入的買進手續費） */
  costPerShare: number;
  sourcePath: string;
}

/** 一次賣出配對產生的已實現損益事件 */
export interface RealizedEvent {
  date: string; // 賣出日
  ticker: string;
  name: string;
  qty: number;
  sellPrice: number;
  /** 賣出淨收入（扣除手續費與證交稅） */
  proceeds: number;
  /** 被消耗 lot 的成本合計（含攤入買進手續費） */
  costBasis: number;
  pnl: number;
  sourcePath: string;
}

export interface FifoIssue {
  filePath: string;
  message: string;
}

export interface FifoResult {
  realized: RealizedEvent[];
  /** ticker → 未平倉 lots（FIFO 順序） */
  openLots: Map<string, Lot[]>;
  /** ticker → 顯示名稱 */
  names: Map<string, string>;
  issues: FifoIssue[];
}

/** 儀表板持倉列 */
export interface Position {
  ticker: string;
  name: string;
  qty: number;
  avgCost: number;
  totalCost: number;
  lastPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
}

export interface RealizedSummaryRow {
  /** 期間鍵，如 '2026-07'、'2026'、'全部' */
  period: string;
  pnl: number;
  costBasis: number;
  /** 期內已實現損益 ÷ 期內平倉成本 */
  returnPct: number | null;
}
