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
   * fetchedAt（epoch ms）一律回傳，供 UI 顯示「資料截至／抓取於」等時間戳
   * （見 utils/time.ts 的格式化函式），讓使用者判斷手上資料有多新。
   */
  async getChart(
    ticker: string,
    opts: FetchChartOptions
  ): Promise<{ data: ChartData; stale: boolean; fetchedAt: number }> {
    const key = `${ticker}|${opts.interval}|${opts.range}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.fetchedAt < this.ttlMs) {
      return { data: cached.data, stale: false, fetchedAt: cached.fetchedAt };
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
      // promise 內部剛 set 過快取，這裡重新讀出來取得本次寫入的 fetchedAt
      const entry = this.cache.get(key);
      return { data, stale: false, fetchedAt: entry?.fetchedAt ?? this.now() };
    } catch (e) {
      if (cached) {
        return { data: cached.data, stale: true, fetchedAt: cached.fetchedAt };
      }
      throw e;
    }
  }

  /**
   * 即時報價（給儀表板未實現損益）：固定用 1d/5d 專屬 cache key 抓取，
   * 與圖表（interval/range 由使用者/設定決定）各自獨立快取，不共用。
   */
  async getQuote(
    ticker: string
  ): Promise<{ price: number | null; stale: boolean; fetchedAt: number }> {
    const { data, stale, fetchedAt } = await this.getChart(ticker, {
      interval: "1d",
      range: "5d",
    });
    const price =
      data.meta.regularMarketPrice ??
      data.bars[data.bars.length - 1]?.close ??
      null;
    return { price, stale, fetchedAt };
  }

  /** 清空全部快取（所有代號、所有 interval/range）。給「清除快取並更新報價」指令使用。 */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 只清除單一代號的快取（所有 interval/range），不影響其他已開圖表或
   * 儀表板其他持股的快取——避免單張圖 / 單檔股票的強制更新誤觸全域重抓
   * （見 clearCache 全清問題的決策備忘）。
   */
  invalidateTicker(ticker: string): void {
    const prefix = `${ticker}|`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  /** invalidateTicker 的多檔版本，供儀表板「更新報價」按鈕使用。 */
  invalidateTickers(tickers: string[]): void {
    for (const t of tickers) this.invalidateTicker(t);
  }
}

/**
 * 依 Yahoo 回應的 HTTP 狀態與內容，判斷是否為「查無代號」等可辨識錯誤，
 * 回傳給使用者看的中文訊息；回傳 null 時交由呼叫端當一般網路/伺服器錯誤處理。
 * 純函式（不 import 'obsidian'），main.ts 的 fetchJson 包一層呼叫它。
 */
export function describeYahooFetchError(
  status: number,
  body: unknown,
  ticker: string
): string | null {
  const hasChartError =
    typeof body === "object" &&
    body !== null &&
    (body as { chart?: { error?: unknown } }).chart?.error != null;
  if (status === 404 || hasChartError) {
    return `查無代號 ${ticker}，請確認上市代號或上櫃請加 .TWO（例如 6488.TWO）`;
  }
  if (status < 200 || status >= 300) {
    return `無法連上 Yahoo（HTTP ${status}），請稍後再試`;
  }
  return null;
}
