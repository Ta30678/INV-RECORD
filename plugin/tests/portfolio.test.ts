import { describe, expect, it } from "vitest";
import { computeFifo } from "../src/trades/fifo";
import {
  buildPositions,
  realizedThisYear,
  summarizeRealized,
} from "../src/trades/portfolio";
import type { TradeRecord } from "../src/types";

function trade(partial: Partial<TradeRecord>): TradeRecord {
  return {
    filePath: partial.filePath ?? "t.md",
    date: partial.date ?? "2026-01-01",
    seq: partial.seq ?? 0,
    ticker: partial.ticker ?? "2330",
    name: partial.name ?? "台積電",
    action: partial.action ?? "buy",
    qty: partial.qty ?? 1000,
    price: partial.price ?? 100,
    fee: partial.fee ?? 0,
    tax: partial.tax ?? 0,
  };
}

describe("buildPositions", () => {
  it("有報價：市值與未實現損益", () => {
    const fifo = computeFifo([
      trade({ action: "buy", qty: 1000, price: 100, fee: 143 }),
    ]);
    const positions = buildPositions(fifo, new Map([["2330", 110]]));
    expect(positions).toHaveLength(1);
    const p = positions[0];
    expect(p.qty).toBe(1000);
    expect(p.totalCost).toBeCloseTo(100143);
    expect(p.avgCost).toBeCloseTo(100.143);
    expect(p.marketValue).toBeCloseTo(110000);
    expect(p.unrealizedPnl).toBeCloseTo(110000 - 100143);
    expect(p.unrealizedPct).toBeCloseTo(((110000 - 100143) / 100143) * 100);
  });

  it("無報價：市值與未實現為 null", () => {
    const fifo = computeFifo([trade({ action: "buy" })]);
    const p = buildPositions(fifo, new Map())[0];
    expect(p.lastPrice).toBeNull();
    expect(p.marketValue).toBeNull();
    expect(p.unrealizedPnl).toBeNull();
  });

  it("全平倉的股票不出現在持倉", () => {
    const fifo = computeFifo([
      trade({ date: "2026-01-01", action: "buy" }),
      trade({ date: "2026-01-02", action: "sell" }),
    ]);
    expect(buildPositions(fifo, new Map())).toHaveLength(0);
  });
});

describe("summarizeRealized", () => {
  const fifo = computeFifo([
    trade({ date: "2026-01-05", action: "buy", qty: 2000, price: 100 }),
    trade({ date: "2026-01-20", action: "sell", qty: 1000, price: 110 }),
    trade({ date: "2026-02-10", action: "sell", qty: 1000, price: 90 }),
  ]);

  it("月度彙總（新月份在前）", () => {
    const rows = summarizeRealized(fifo.realized, "month");
    expect(rows.map((r) => r.period)).toEqual(["2026-02", "2026-01"]);
    expect(rows[1].pnl).toBeCloseTo(10000);
    expect(rows[1].returnPct).toBeCloseTo(10);
    expect(rows[0].pnl).toBeCloseTo(-10000);
    expect(rows[0].returnPct).toBeCloseTo(-10);
  });

  it("年度與全部", () => {
    expect(summarizeRealized(fifo.realized, "year")[0]).toMatchObject({
      period: "2026",
      pnl: 0,
    });
    const all = summarizeRealized(fifo.realized, "all");
    expect(all).toHaveLength(1);
    expect(all[0].period).toBe("全部");
    expect(all[0].returnPct).toBeCloseTo(0);
  });

  it("realizedThisYear 只算今年", () => {
    expect(realizedThisYear(fifo.realized, "2026-07-10")).toBeCloseTo(0);
    expect(realizedThisYear(fifo.realized, "2027-01-01")).toBe(0);
  });
});
