import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEE_SETTINGS,
  estimateFee,
  estimateTax,
} from "../src/trades/fees";

describe("estimateFee", () => {
  it("一般整股：1000 股 × 985 → 0.1425%", () => {
    expect(estimateFee(1000, 985)).toBe(Math.round(985000 * 0.001425)); // 1404
  });

  it("最低 20 元", () => {
    expect(estimateFee(10, 50)).toBe(20); // 500 × 0.1425% ≈ 0.7 → 20
  });

  it("折扣", () => {
    expect(
      estimateFee(1000, 985, { ...DEFAULT_FEE_SETTINGS, feeDiscount: 0.6 })
    ).toBe(Math.round(985000 * 0.001425 * 0.6));
  });
});

describe("estimateTax", () => {
  it("賣出課 0.3%", () => {
    expect(estimateTax(1000, 985, "sell")).toBe(Math.round(985000 * 0.003));
  });
  it("買進為 0", () => {
    expect(estimateTax(1000, 985, "buy")).toBe(0);
  });
});
