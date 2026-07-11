import type { KlineParams, KlinePeriod, KlineRange } from "../types";
import { normalizeTicker } from "../yahoo/parse";

/**
 * 純函式：解析 ```kline 區塊內容。
 * 第一個非空行 = 股票代號，其餘為 key: value；未知 key 忽略。
 */

const PERIODS: Record<string, KlinePeriod> = {
  d: "D",
  w: "W",
  m: "M",
  日: "D",
  週: "W",
  周: "W",
  月: "M",
};

const RANGES: KlineRange[] = ["1mo", "3mo", "6mo", "1y", "2y", "5y", "max"];

export class KlineParamsError extends Error {}

export function parseKlineBlock(source: string): KlineParams {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) {
    throw new KlineParamsError("kline 區塊缺少股票代號（第一行請填代號，例如 2330）");
  }

  let ticker: string | null = null;
  let period: KlinePeriod = "D";
  let range: KlineRange | null = null;

  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) {
      if (ticker === null) {
        ticker = normalizeTicker(line);
      }
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "ticker" || key === "代號") {
      ticker = normalizeTicker(value);
    } else if (key === "period" || key === "週期" || key === "周期") {
      const p = PERIODS[value.trim().toLowerCase()];
      if (!p) {
        throw new KlineParamsError(`不支援的週期「${value}」，請用 D / W / M`);
      }
      period = p;
    } else if (key === "range" || key === "範圍") {
      const r = value.trim().toLowerCase() as KlineRange;
      if (!RANGES.includes(r)) {
        throw new KlineParamsError(
          `不支援的範圍「${value}」，請用 ${RANGES.join(" / ")}`
        );
      }
      range = r;
    }
    // 未知 key：忽略
  }

  // 上市為純代號，上櫃保留 .TWO 後綴（normalizeTicker 已統一大寫並剝除 .TW）
  if (!ticker || !/^[0-9A-Z]+(\.TWO)?$/.test(ticker)) {
    throw new KlineParamsError(
      "kline 區塊缺少有效的股票代號（例如 2330，上櫃請用 6488.TWO）"
    );
  }

  return { ticker, period, range };
}

export function periodToInterval(period: KlinePeriod): "1d" | "1wk" | "1mo" {
  switch (period) {
    case "D":
      return "1d";
    case "W":
      return "1wk";
    case "M":
      return "1mo";
  }
}

export function periodLabel(period: KlinePeriod): string {
  switch (period) {
    case "D":
      return "日K";
    case "W":
      return "週K";
    case "M":
      return "月K";
  }
}
