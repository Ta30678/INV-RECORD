import type { ParseIssue, TradeRecord } from "../types";
import { taiwanDateStringFromMs } from "../utils/time";
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

/**
 * YAML date 可能是 Date 物件或字串；統一成 'YYYY-MM-DD'。
 * Date 物件分支改走台灣時區換算（與 utils/time.ts 同法），而不是 UTC 截字——
 * 否則 Obsidian/YAML 把裸 datetime 解析成非 UTC 午夜的 Date 時，UTC 截字可能
 * 落到前一日，讓交易被歸到錯誤日期並汙染 FIFO 排序與月/年損益歸屬。
 */
function asDateString(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return taiwanDateStringFromMs(v.getTime());
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    }
  }
  return null;
}

/** 選填的成交時間 'HH:mm'（24 小時制）；格式錯誤時回傳 undefined 並附警告訊息。 */
function asTradeTime(v: unknown): { time: string | undefined; warning: string | null } {
  if (v === undefined || v === null || v === "") {
    return { time: undefined, warning: null };
  }
  const s = String(v).trim();
  if (/^\d{2}:\d{2}$/.test(s)) {
    return { time: s, warning: null };
  }
  return {
    time: undefined,
    warning: "time 格式須為 HH:mm（24 小時制），已忽略此欄位",
  };
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

  // time 為選填欄位，格式錯誤不影響整筆交易是否列入計算，只記警告並忽略該欄
  // （與其餘必要欄位不同：那些欄位錯誤時整筆交易都不列入計算）。
  const { time, warning: timeWarning } = asTradeTime(frontmatter.time);
  if (timeWarning) issues.push({ filePath, message: timeWarning });

  if (
    !date ||
    (action !== "buy" && action !== "sell") ||
    !ticker ||
    qty === null ||
    price === null ||
    fee === null ||
    tax === null
  ) {
    return { trade: null, issues };
  }

  return {
    trade: {
      filePath,
      date: date!,
      time,
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
