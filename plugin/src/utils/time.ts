/**
 * 全案時間單一事實來源：一律使用台灣時間（UTC+8）。
 *
 * 規則：
 * - 「現在」一律透過本模組取得（taiwanToday / taiwanNowString），禁止在其他檔案
 *   直接寫 new Date().toISOString().slice(0, 10) 之類的 UTC 截字——那會讓台灣時間
 *   00:00–07:59 建立的資料被標成前一天，汙染 FIFO 排序與月/年損益歸屬。
 * - UI 顯示一律 24 小時制絕對時間，不用相對時間（「3 分鐘前」）、不用 12 小時制。
 * - 純函式，不 import 'obsidian'，可在 vitest（node 環境）直接測試。
 */

const TAIWAN_OFFSET_MS = 8 * 3600 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface TaiwanParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
}

/** 任意毫秒時間戳（epoch ms）→ 台灣時間的年/月/日/時/分拆解。 */
function taiwanParts(ms: number): TaiwanParts {
  const shifted = new Date(ms + TAIWAN_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    hh: shifted.getUTCHours(),
    mm: shifted.getUTCMinutes(),
  };
}

/** 任意毫秒時間戳（epoch ms）→ 台灣日期 'YYYY-MM-DD'。 */
export function taiwanDateStringFromMs(ms: number): string {
  const { y, m, d } = taiwanParts(ms);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 今天的台灣日期 'YYYY-MM-DD'。now（epoch ms）可注入供測試，預設 Date.now()。 */
export function taiwanToday(now: number = Date.now()): string {
  return taiwanDateStringFromMs(now);
}

/** 現在的台灣日期時間 'YYYY-MM-DD HH:mm'。now（epoch ms）可注入供測試，預設 Date.now()。 */
export function taiwanNowString(now: number = Date.now()): string {
  const { y, m, d, hh, mm } = taiwanParts(now);
  return `${y}-${pad(m)}-${pad(d)} ${pad(hh)}:${pad(mm)}`;
}

/**
 * Yahoo 等 API 回傳的 unix 秒 → 台灣交易日 'YYYY-MM-DD'。
 * Yahoo 時間戳為 UTC，+8h 後取 UTC 年月日即為台灣交易日。
 */
export function toTaiwanDateString(unixSeconds: number): string {
  return taiwanDateStringFromMs(unixSeconds * 1000);
}

/**
 * 任意毫秒時間戳（epoch ms，例如 Date.now() 或快取的 fetchedAt）
 * → 完整台灣時間字串 'YYYY-MM-DD HH:mm'。
 * 若來源是 unix 秒（例如 Yahoo 的 regularMarketTime），呼叫端請自行 ×1000。
 */
export function formatTaiwanDateTime(ms: number): string {
  const { y, m, d, hh, mm } = taiwanParts(ms);
  return `${y}-${pad(m)}-${pad(d)} ${pad(hh)}:${pad(mm)}`;
}

/**
 * 同年可省略年份的簡短格式 'MM-DD HH:mm'（不同年則仍顯示完整 'YYYY-MM-DD HH:mm'）。
 * 僅用於輔助資訊（如抓取時間），不作為主要顯示。
 * referenceMs 為判斷「今年」的基準時間，預設呼叫當下。
 */
export function formatTaiwanDateTimeShort(
  ms: number,
  referenceMs: number = Date.now()
): string {
  const parts = taiwanParts(ms);
  const ref = taiwanParts(referenceMs);
  if (parts.y === ref.y) {
    return `${pad(parts.m)}-${pad(parts.d)} ${pad(parts.hh)}:${pad(parts.mm)}`;
  }
  return `${parts.y}-${pad(parts.m)}-${pad(parts.d)} ${pad(parts.hh)}:${pad(parts.mm)}`;
}

/** unix 秒是否落在台股盤中時段（09:00–13:30，含頭尾）。 */
export function isTaiwanMarketHours(unixSeconds: number): boolean {
  const { hh, mm } = taiwanParts(unixSeconds * 1000);
  const minutes = hh * 60 + mm;
  return minutes >= 9 * 60 && minutes <= 13 * 60 + 30;
}

/**
 * K 線「資料截至」用的盤中/收盤後綴。regularMarketTime 為 null（無法取得）時
 * 回傳空字串，不做假設——這是「不做假精確」原則的一部分。
 */
export function marketSessionSuffix(regularMarketTime: number | null): string {
  if (regularMarketTime === null) return "";
  return isTaiwanMarketHours(regularMarketTime) ? "（盤中）" : "（收盤）";
}
