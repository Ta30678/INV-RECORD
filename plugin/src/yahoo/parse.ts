import type { ChartData, OhlcBar, QuoteMeta } from "../types";

/**
 * 純函式：解析 Yahoo v8/finance/chart 回應。
 * 禁止 import 'obsidian'，以便在 vitest（node 環境）直接測試。
 */

const TAIWAN_OFFSET_SECONDS = 8 * 3600;

/** Yahoo 時間戳為 UTC；+8h 後取 UTC 年月日即為台灣交易日。 */
export function toTaiwanDateString(unixSeconds: number): string {
  const d = new Date((unixSeconds + TAIWAN_OFFSET_SECONDS) * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

/** '2330' / '2330.TW' / '0050' → Yahoo symbol（預設補 .TW） */
export function toYahooSymbol(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (t.includes(".")) return t;
  return `${t}.TW`;
}

/** Yahoo symbol / 使用者輸入 → 純代號（去除 .TW/.TWO 後綴） */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\.(TW|TWO)$/i, "");
}
