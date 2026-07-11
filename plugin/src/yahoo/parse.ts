import type { ChartData, OhlcBar, QuoteMeta } from "../types";
import { toTaiwanDateString } from "../utils/time";

/**
 * 純函式：解析 Yahoo v8/finance/chart 回應。
 * 禁止 import 'obsidian'，以便在 vitest（node 環境）直接測試。
 */

// 時間單一事實來源在 utils/time.ts；這裡重新匯出以維持既有呼叫端（含測試）不變。
export { toTaiwanDateString };

export class YahooParseError extends Error {}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function parseChartResponse(json: unknown): ChartData {
  const root = json as {
    chart?: {
      error?: { code?: string; description?: string } | null;
      result?: Array<{
        meta?: Record<string, unknown>;
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
            volume?: Array<number | null>;
          }>;
        };
      }> | null;
    };
  };

  const err = root?.chart?.error;
  if (err) {
    throw new YahooParseError(err.description ?? err.code ?? "Yahoo 回應錯誤");
  }
  const result = root?.chart?.result?.[0];
  if (!result) {
    throw new YahooParseError("Yahoo 回應中沒有 chart.result");
  }

  const rawMeta = result.meta ?? {};
  const meta: QuoteMeta = {
    symbol: typeof rawMeta.symbol === "string" ? rawMeta.symbol : "",
    regularMarketPrice: num(rawMeta.regularMarketPrice),
    previousClose: num(
      rawMeta.chartPreviousClose ?? rawMeta.previousClose ?? null
    ),
    currency: typeof rawMeta.currency === "string" ? rawMeta.currency : null,
    shortName: typeof rawMeta.shortName === "string" ? rawMeta.shortName : null,
    // 最後成交/報價時間（unix 秒）；用來判斷「盤中」或「收盤」（見 utils/time.ts）。
    regularMarketTime: num(rawMeta.regularMarketTime),
  };

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const bars: OhlcBar[] = [];
  if (quote) {
    for (let i = 0; i < timestamps.length; i++) {
      const open = num(quote.open?.[i]);
      const high = num(quote.high?.[i]);
      const low = num(quote.low?.[i]);
      const close = num(quote.close?.[i]);
      // Yahoo 偶爾回傳整根為 null 的 bar（停牌、資料缺漏）→ 略過
      if (open === null || high === null || low === null || close === null) {
        continue;
      }
      bars.push({
        time: toTaiwanDateString(timestamps[i]),
        open,
        high,
        low,
        close,
        volume: num(quote.volume?.[i]) ?? 0,
      });
    }
  }

  return { bars, meta };
}

/** '2330' / '2330.TW' / '6488.TWO' → Yahoo symbol（上市預設補 .TW，上櫃保留 .TWO） */
export function toYahooSymbol(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (t.includes(".")) return t;
  return `${t}.TW`;
}

/**
 * Yahoo symbol / 使用者輸入 → canonical ticker（見 canonical ticker 決策備忘）。
 * 上市股票只有純代號（隱含 .TW，去除後綴）；上櫃股票保留 .TWO 後綴——
 * 只剝除結尾的 .TW，.TWO 結尾不受影響（'6488.TWO' 不會被誤剝成 '6488'）。
 * 全管線（normalize→frontmatter→FIFO 分組→Yahoo symbol）一律使用同一形態。
 */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\.TW$/, "");
}
