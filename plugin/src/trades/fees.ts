/**
 * 純函式：台股手續費 / 證交稅試算（scaffold 新增交易時預填用）。
 * - 手續費：成交金額 × 0.1425% × 折扣，最低 20 元（整股）／1 元（零股，依券商而異）
 * - 證交稅：賣出時成交金額 × 稅率（一般股票 0.3%／ETF／債券ETF 可由呼叫端覆寫，
 *   當沖減半不在 v1 範圍）
 * 金額皆無條件捨去到整數元（多數券商手續費與代徵證交稅尾數不滿一元不計，
 * 與對帳單吻合是紀錄工具的天職；少數券商採四捨五入，預填值皆可手動修改）。
 */

export interface FeeSettings {
  /** 券商牌告費率，預設 0.001425 */
  feeRate: number;
  /** 折扣倍數，例如 0.6 = 六折，預設 1 */
  feeDiscount: number;
  /** 證交稅率，預設 0.003 */
  taxRate: number;
  /** 整股最低手續費（元），預設 20 */
  minFee: number;
  /** 零股最低手續費（元），依券商而異，預設 1 */
  oddLotMinFee: number;
}

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  feeRate: 0.001425,
  feeDiscount: 1,
  taxRate: 0.003,
  minFee: 20,
  oddLotMinFee: 1,
};

/** 股數是否為零股：非 1000 股整數倍即為零股（單股數必然非整張倍數）。 */
function isOddLot(qty: number): boolean {
  return qty % 1000 !== 0;
}

export function estimateFee(
  qty: number,
  price: number,
  s: FeeSettings = DEFAULT_FEE_SETTINGS
): number {
  if (qty <= 0 || price <= 0) return 0;
  const raw = qty * price * s.feeRate * s.feeDiscount;
  const floor = isOddLot(qty) ? s.oddLotMinFee : s.minFee;
  return Math.max(floor, Math.floor(raw));
}

/**
 * @param rateOverride 選填，覆寫 s.taxRate（供「證交稅別」下拉選單使用，
 * 例如 ETF 0.001、債券ETF 0；不傳則用 s.taxRate，行為與舊版相同）
 */
export function estimateTax(
  qty: number,
  price: number,
  action: "buy" | "sell",
  s: FeeSettings = DEFAULT_FEE_SETTINGS,
  rateOverride?: number
): number {
  if (action !== "sell" || qty <= 0 || price <= 0) return 0;
  const rate = rateOverride ?? s.taxRate;
  return Math.floor(qty * price * rate);
}
