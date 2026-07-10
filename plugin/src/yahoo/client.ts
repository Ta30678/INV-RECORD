import type { ChartData } from "../types";
import { parseChartResponse, toYahooSymbol } from "./parse";

/**
 * Yahoo chart API 客戶端：TTL 記憶體快取 + in-flight 去重 + stale 回退。
 * fetchJson 由外部注入（正式環境包 obsidian requestUrl，測試注入 fixture），
 * 因此本模組本身不 import 'obsidian'，可直接單元測試。
 */

export type FetchJson = (url: string) => Promise<unknown>;

interface CacheEntry {
  data: ChartData;
  fetchedAt: number;
}

export interface FetchChartOptions {
  interval: "1d" | "1wk" | "1mo";
  range: string;
}

export class YahooClient {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<ChartData>>();

  constructor(
    private fetchJson: FetchJson,
    /** 快取有效毫秒數；由設定頁換算分鐘 */
    public ttlMs: number,
    private now: () => number = () => Date.now()
  ) {}

  private url(ticker: string, opts: FetchChartOptions): string {
    const symbol = encodeURIComponent(toYahooSymbol(ticker));
    return `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${opts.interval}&range=${opts.range}`;
  }

  /**
   * 取得 K 線與報價。快取未過期直接回傳；過期重抓，
   * 抓取失敗但有舊快取時回傳舊資料（stale=true）。
   */
  async getChart(
    ticker: string,
    opts: FetchChartOptions
  ): Promise<{ data: ChartData; stale: boolean }> {
    const key = `${ticker}|${opts.interval}|${opts.range}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.fetchedAt < this.ttlMs) {
      return { data: cached.data, stale: false };
    }

    let promise = this.inflight.get(key);
    if (!promise) {
      promise = (async () => {
        const json = await this.fetchJson(this.url(ticker, opts));
        const data = parseChartResponse(json);
        this.cache.set(key, { data, fetchedAt: this.now() });
        return data;
      })();
      this.inflight.set(key, promise);
      // .finally 產生的衍生 promise 需自行吞掉 rejection，
      // 否則失敗時會觸發 unhandled rejection（呼叫端 await 的是原 promise）
      promise
        .finally(() => this.inflight.delete(key))
        .catch(() => {});
    }

    try {
      const data = await promise;
      return { data, stale: false };
    } catch (e) {
      if (cached) {
        return { data: cached.data, stale: true };
      }
      throw e;
    }
  }

  /** 即時報價（給儀表板未實現損益）：用日K短 range，共用同一快取。 */
  async getQuote(ticker: string): Promise<{ price: number | null; stale: boolean }> {
    const { data, stale } = await this.getChart(ticker, {
      interval: "1d",
      range: "5d",
    });
    const price =
      data.meta.regularMarketPrice ??
      data.bars[data.bars.length - 1]?.close ??
      null;
    return { price, stale };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
