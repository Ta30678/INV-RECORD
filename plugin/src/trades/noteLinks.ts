import type { ParseIssue } from "../types";
import { normalizeTicker } from "../yahoo/parse";

/**
 * 純函式：雙向鏈結相關工具。
 * - 建立交易/個股筆記時，stock:/theme: 連結一律「反查既有筆記」而非硬拼檔名，
 *   避免 dangling link（[[名稱 代號]] 猜錯）與重複 token（[[2330 2330]]）。
 * - 計算鏈只認 ticker 字串（見 parser.ts），這裡只做「唯讀」一致性檢查，
 *   不會反過來同步任何 frontmatter。
 */

export interface VaultNoteRef {
  path: string;
  frontmatter: Record<string, unknown> | undefined;
}

function basenameNoExt(path: string): string {
  const slash = path.lastIndexOf("/");
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  return base.replace(/\.md$/i, "");
}

/** 由檔案路徑組出該筆記的 wikilink（用檔名，不含資料夾與副檔名）。 */
export function wikilinkFromPath(path: string): string {
  return `[[${basenameNoExt(path)}]]`;
}

/** 在筆記清單中尋找 type 與檔名（不含副檔名）相符的筆記路徑；找不到回傳 null。 */
export function findNoteByTypeAndBasename(
  notes: VaultNoteRef[],
  type: string,
  name: string
): string | null {
  const target = name.trim();
  if (!target) return null;
  for (const n of notes) {
    if (n.frontmatter?.type !== type) continue;
    if (basenameNoExt(n.path) === target) return n.path;
  }
  return null;
}

/** 在筆記清單中尋找 type:stock 且 ticker（正規化後）相符的筆記路徑；找不到回傳 null。 */
export function findStockNoteByTicker(
  notes: VaultNoteRef[],
  ticker: string
): string | null {
  const target = normalizeTicker(ticker);
  if (!target) return null;
  for (const n of notes) {
    if (n.frontmatter?.type !== "stock") continue;
    const raw = n.frontmatter.ticker;
    if (raw === undefined || raw === null) continue;
    if (normalizeTicker(String(raw)) === target) return n.path;
  }
  return null;
}

/** 在筆記清單中尋找 type:theme 且檔名與題材名稱相符的筆記路徑；找不到回傳 null。 */
export function findThemeNoteByName(
  notes: VaultNoteRef[],
  name: string
): string | null {
  return findNoteByTypeAndBasename(notes, "theme", name);
}

/** 使用者輸入的題材欄位（逗號/頓號分隔，中英皆可）→ 去除空白的題材名稱清單。 */
export function parseThemeNames(raw: string): string[] {
  return raw
    .split(/[,，、]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 個股筆記檔名（不含資料夾與副檔名）。名稱留空時只用代號，
 * 避免「2330 2330.md」這種重複 token（見雙向鏈結決策備忘）；
 * 有名稱時維持「名稱 代號」慣例（例如「台積電 2330」），與 stockLink 命名規則一致。
 */
export function stockNoteBaseName(ticker: string, name: string): string {
  const trimmedName = name.trim();
  return trimmedName ? `${trimmedName} ${ticker}` : ticker;
}

/**
 * 組出個股筆記 up: frontmatter 的值（含引號/陣列語法，不含欄位名）。
 * 0 個題材 → `""`；1 個 → 單一字串；多個 → YAML 行內陣列（一檔個股可橫跨多題材）。
 */
export function buildUpFieldValue(themeNames: string[]): string {
  if (themeNames.length === 0) return `""`;
  if (themeNames.length === 1) return `"[[${themeNames[0]}]]"`;
  return `[${themeNames.map((n) => `"[[${n}]]"`).join(", ")}]`;
}

/**
 * 比對交易的 ticker 與其 stock: 連結目標筆記的 ticker 是否一致。
 * 只在連結「可解析到筆記」且該筆記有 ticker 欄位時才比對；
 * 找不到筆記或筆記沒有 ticker 一律回傳 null（不視為錯誤，交給既有的 dangling link 提示）。
 */
export function checkStockLinkConsistency(
  filePath: string,
  tradeTicker: string,
  targetTickerRaw: string,
  targetPath: string
): ParseIssue | null {
  const targetTicker = normalizeTicker(targetTickerRaw);
  if (!targetTicker || targetTicker === tradeTicker) return null;
  return {
    filePath,
    message: `stock 連結指向「${targetPath}」（ticker=${targetTicker}），但本筆 ticker=${tradeTicker}，兩者不一致，請確認其中一邊是否改錯`,
  };
}
