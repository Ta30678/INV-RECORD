import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEE_SETTINGS,
  estimateFee,
  estimateTax,
} from "../src/trades/fees";

describe("estimateFee", () => {
  it("一般整股：1000 股 × 985 → 0.1425%，無條件捨去", () => {
    expect(estimateFee(1000, 985)).toBe(1403); // 985000*0.001425=1403.625 → floor 1403
  });

  it("整股最低 20 元（未滿以 20 計）", () => {
    expect(estimateFee(1000, 1)).toBe(20); // 1000*0.1425%=1.425 → floor 1 < 20 → 20
    expect(estimateFee(2000, 5)).toBe(20); // 10000*0.1425%=14.25 → floor 14 < 20 → 20
  });

  it("零股最低 1 元，不套用整股的 20 元下限", () => {
    // 50 股 × 100 元：50*100*0.001425=7.125 → floor 7（> 1 元下限，直接用 7）
    expect(estimateFee(50, 100)).toBe(7);
    // 10 股 × 20 元：10*20*0.001425=0.285 → floor 0，套零股下限 max(1,0)=1
    expect(estimateFee(10, 20)).toBe(1);
  });

  it("零股最低手續費可透過設定調整（例如券商仍收 20 元）", () => {
    expect(
      estimateFee(10, 20, { ...DEFAULT_FEE_SETTINGS, oddLotMinFee: 20 })
    ).toBe(20);
  });

  it("折扣", () => {
    expect(
      estimateFee(1000, 985, { ...DEFAULT_FEE_SETTINGS, feeDiscount: 0.6 })
    ).toBe(Math.floor(985000 * 0.001425 * 0.6));
  });
});

describe("estimateTax", () => {
  it("賣出課 0.3%，無條件捨去", () => {
    expect(estimateTax(1000, 985, "sell")).toBe(Math.floor(985000 * 0.003));
  });
  it("買進為 0", () => {
    expect(estimateTax(1000, 985, "buy")).toBe(0);
  });
  it("rateOverride 供證交稅別下拉使用（例如 ETF 0.1%）", () => {
    expect(estimateTax(1000, 985, "sell", DEFAULT_FEE_SETTINGS, 0.001)).toBe(
      Math.floor(985000 * 0.001)
    );
  });
  it("rateOverride 為 0（債券 ETF 現行免徵）", () => {
    expect(estimateTax(1000, 985, "sell", DEFAULT_FEE_SETTINGS, 0)).toBe(0);
  });
});
