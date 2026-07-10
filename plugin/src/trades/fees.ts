/**
 * 純函式：台股手續費 / 證交稅試算（scaffold 新增交易時預填用）。
 * - 手續費：成交金額 × 0.1425% × 折扣，最低 20 元（未滿以 20 計）
 * - 證交稅：賣出時成交金額 × 0.3%（一般股票；當沖減半不在 v1 範圍）
 * 金額皆四捨五入到整數元。
 */

export interface FeeSettings {
  /** 券商牌告費率，預設 0.001425 */
  feeRate: number;
  /** 折扣倍數，例如 0.6 = 六折，預設 1 */
  feeDiscount: number;
  /** 證交稅率，預設 0.003 */
  taxRate: number;
  /** 最低手續費（元），預設 20 */
  minFee: number;
}

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  feeRate: 0.001425,
  feeDiscount: 1,
  taxRate: 0.003,
  minFee: 20,
};

export function estimateFee(
  qty: number,
  price: number,
  s: FeeSettings = DEFAULT_FEE_SETTINGS
): number {
  if (qty <= 0 || price <= 0) return 0;
  const raw = qty * price * s.feeRate * s.feeDiscount;
  return Math.max(s.minFee, Math.round(raw));
}

export function estimateTax(
  qty: number,
  price: number,
  action: "buy" | "sell",
  s: FeeSettings = DEFAULT_FEE_SETTINGS
): number {
  if (action !== "sell" || qty <= 0 || price <= 0) return 0;
  return Math.round(qty * price * s.taxRate);
}
