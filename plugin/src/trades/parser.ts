import type { ParseIssue, TradeRecord } from "../types";
import { normalizeTicker } from "../yahoo/parse";

/**
 * 純函式：把 frontmatter 物件驗證、轉成 TradeRecord。
 * 不合法的欄位回報 ParseIssue，不丟例外，讓儀表板能顯示警告而不中斷。
 */

export interface TradeParseResult {
  trade: TradeRecord | null;
  issues: ParseIssue[];
}

function asPositiveNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function asNonNegativeNumber(v: unknown, fallback: number): number | null {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** YAML date 可能是 Date 物件或字串；統一成 'YYYY-MM-DD'。 */
function asDateString(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * @param frontmatter Obsidian metadataCache 給的 frontmatter 物件
 * @param filePath 檔案路徑（issue 與排序用）
 */
export function parseTradeFrontmatter(
  frontmatter: Record<string, unknown> | undefined,
  filePath: string
): TradeParseResult {
  const issues: ParseIssue[] = [];
  if (!frontmatter || frontmatter.type !== "trade") {
    return { trade: null, issues }; // 非交易筆記，靜默略過
  }

  const date = asDateString(frontmatter.date);
  if (!date) issues.push({ filePath, message: "date 缺少或無法解析（YYYY-MM-DD）" });

  const action = frontmatter.action;
  if (action !== "buy" && action !== "sell") {
    issues.push({ filePath, message: "action 必須是 buy 或 sell" });
  }

  // YAML 會把未加引號的代號轉成數字 → 強制 String() 雙保險
  const rawTicker = frontmatter.ticker;
  const ticker =
    rawTicker !== undefined && rawTicker !== null
      ? normalizeTicker(String(rawTicker))
      : "";
  if (!ticker) issues.push({ filePath, message: "ticker 缺少" });

  const qty = asPositiveNumber(frontmatter.qty);
  if (qty === null) issues.push({ filePath, message: "qty 必須是正數（股數）" });

  const price = asPositiveNumber(frontmatter.price);
  if (price === null) issues.push({ filePath, message: "price 必須是正數" });

  const fee = asNonNegativeNumber(frontmatter.fee, 0);
  if (fee === null) issues.push({ filePath, message: "fee 必須 ≥ 0" });

  const tax = asNonNegativeNumber(frontmatter.tax, 0);
  if (tax === null) issues.push({ filePath, message: "tax 必須 ≥ 0" });

  const seqRaw = frontmatter.seq;
  const seq =
    seqRaw === undefined || seqRaw === null
      ? 0
      : typeof seqRaw === "number" && Number.isFinite(seqRaw)
        ? seqRaw
        : Number(String(seqRaw)) || 0;

  if (issues.length > 0) {
    return { trade: null, issues };
  }

  return {
    trade: {
      filePath,
      date: date!,
      seq,
      ticker,
      name:
        typeof frontmatter.name === "string" && frontmatter.name.trim()
          ? frontmatter.name.trim()
          : ticker,
      action: action as "buy" | "sell",
      qty: qty!,
      price: price!,
      fee: fee!,
      tax: tax!,
    },
    issues,
  };
}
