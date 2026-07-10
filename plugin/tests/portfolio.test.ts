import { describe, expect, it } from "vitest";
import { computeFifo } from "../src/trades/fifo";
import {
  buildPositions,
  dashboardRangeLabel,
  filterRealizedByRange,
  resolveDashboardRange,
  summarizeRealized,
  summarizeRealizedByTicker,
  summarizeRealizedTotals,
  totalInvestedCost,
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

  it("「今年」範圍跨年不誤算：2025 與 2026 各一筆非零損益，只計入 2026 的（取代舊版 realizedThisYear）", () => {
    const crossYearFifo = computeFifo([
      trade({ date: "2025-01-05", action: "buy", qty: 1000, price: 100 }),
      trade({ date: "2025-06-01", action: "sell", qty: 1000, price: 150 }), // +50000（2025）
      trade({ date: "2026-01-05", action: "buy", qty: 1000, price: 100 }),
      trade({ date: "2026-06-01", action: "sell", qty: 1000, price: 90 }), // -10000（2026）
    ]);
    const today = "2026-07-10";
    const range = resolveDashboardRange("thisYear", today);
    const filtered = filterRealizedByRange(crossYearFifo.realized, range.from, range.to);
    expect(summarizeRealizedTotals(filtered).pnl).toBeCloseTo(-10000);
  });
});

describe("filterRealizedByRange", () => {
  const fifo = computeFifo([
    trade({ date: "2026-01-05", action: "buy", qty: 3000, price: 100 }),
    trade({ date: "2026-01-10", action: "sell", qty: 1000, price: 110, filePath: "a.md" }),
    trade({ date: "2026-02-15", action: "sell", qty: 1000, price: 120, filePath: "b.md" }),
    trade({ date: "2026-03-20", action: "sell", qty: 1000, price: 90, filePath: "c.md" }),
  ]);

  it("含頭尾：from/to 皆給定時包含邊界值", () => {
    const rows = filterRealizedByRange(fifo.realized, "2026-01-10", "2026-02-15");
    expect(rows.map((r) => r.sourcePath)).toEqual(["a.md", "b.md"]);
  });

  it("只給 from：篩掉更早的", () => {
    const rows = filterRealizedByRange(fifo.realized, "2026-02-15");
    expect(rows.map((r) => r.sourcePath)).toEqual(["b.md", "c.md"]);
  });

  it("只給 to：篩掉更晚的", () => {
    const rows = filterRealizedByRange(fifo.realized, undefined, "2026-01-10");
    expect(rows.map((r) => r.sourcePath)).toEqual(["a.md"]);
  });

  it("皆不給：不過濾", () => {
    expect(filterRealizedByRange(fifo.realized)).toHaveLength(3);
  });
});

describe("summarizeRealizedTotals", () => {
  it("加總 pnl 與 costBasis，returnPct = pnl/costBasis", () => {
    const fifo = computeFifo([
      trade({ date: "2026-01-05", action: "buy", qty: 2000, price: 100 }),
      trade({ date: "2026-01-20", action: "sell", qty: 1000, price: 110 }),
      trade({ date: "2026-02-10", action: "sell", qty: 1000, price: 90 }),
    ]);
    const totals = summarizeRealizedTotals(fifo.realized);
    expect(totals.pnl).toBeCloseTo(0);
    expect(totals.costBasis).toBeCloseTo(200000);
    expect(totals.returnPct).toBeCloseTo(0);
  });

  it("空陣列：costBasis 為 0 時 returnPct 為 null", () => {
    expect(summarizeRealizedTotals([])).toEqual({
      pnl: 0,
      costBasis: 0,
      returnPct: null,
    });
  });
});

describe("summarizeRealizedByTicker", () => {
  it("多檔分桶、依 pnl 降冪排序、含勝率與加權持有天數", () => {
    const fifo = computeFifo([
      // 2330：兩筆賣出，一勝一敗，pnl 合計為正
      trade({ ticker: "2330", name: "台積電", date: "2026-01-01", action: "buy", qty: 2000, price: 100 }),
      trade({ ticker: "2330", name: "台積電", date: "2026-01-11", action: "sell", qty: 1000, price: 150 }), // +50000, 賺
      trade({ ticker: "2330", name: "台積電", date: "2026-01-21", action: "sell", qty: 1000, price: 90 }), // -10000, 賠
      // 3661：一筆賣出，虧損，pnl 為負，持有天數不同
      trade({ ticker: "3661", name: "世芯-KY", date: "2026-01-01", action: "buy", qty: 100, price: 2000 }),
      trade({ ticker: "3661", name: "世芯-KY", date: "2026-01-06", action: "sell", qty: 100, price: 1900 }), // -10000
    ]);
    const rows = summarizeRealizedByTicker(fifo.realized);
    expect(rows.map((r) => r.ticker)).toEqual(["2330", "3661"]); // pnl 降冪：40000 > -10000
    const tsmc = rows[0];
    expect(tsmc.sellCount).toBe(2);
    expect(tsmc.pnl).toBeCloseTo(40000);
    expect(tsmc.winRate).toBeCloseTo(50);
    // 加權持有天數：(1000*10 + 1000*20) / 2000 = 15
    expect(tsmc.avgHoldingDays).toBeCloseTo(15);
    const world = rows[1];
    expect(world.winRate).toBeCloseTo(0);
    expect(world.avgHoldingDays).toBeCloseTo(5);
  });

  it("costBasis 為 0 時 returnPct 為 null", () => {
    const rows = summarizeRealizedByTicker([
      {
        date: "2026-01-01",
        ticker: "2330",
        name: "台積電",
        qty: 100,
        sellPrice: 10,
        proceeds: 1000,
        costBasis: 0,
        pnl: 1000,
        avgHoldingDays: 1,
        sourcePath: "x.md",
      },
    ]);
    expect(rows[0].returnPct).toBeNull();
  });
});

describe("totalInvestedCost", () => {
  it("只加總買進交易的成交金額 + 費 + 稅", () => {
    const trades: TradeRecord[] = [
      trade({ action: "buy", qty: 1000, price: 100, fee: 143 }),
      trade({ action: "sell", qty: 500, price: 110, fee: 78, tax: 165 }),
      trade({ action: "buy", qty: 500, price: 120, fee: 86 }),
    ];
    expect(totalInvestedCost(trades)).toBeCloseTo(
      1000 * 100 + 143 + (500 * 120 + 86)
    );
  });

  it("已平倉又再買回：分母仍含全部買進（不只目前持倉）", () => {
    const trades: TradeRecord[] = [
      trade({ date: "2026-01-01", action: "buy", qty: 1000, price: 100 }),
      trade({ date: "2026-01-10", action: "sell", qty: 1000, price: 110 }),
      trade({ date: "2026-02-01", action: "buy", qty: 1000, price: 105 }),
    ];
    expect(totalInvestedCost(trades)).toBeCloseTo(1000 * 100 + 1000 * 105);
  });

  it("空陣列回傳 0", () => {
    expect(totalInvestedCost([])).toBe(0);
  });
});

describe("resolveDashboardRange", () => {
  it("本月：從當月 1 號到今天", () => {
    expect(resolveDashboardRange("thisMonth", "2026-07-10")).toEqual({
      from: "2026-07-01",
      to: "2026-07-10",
    });
  });

  it("上月：一般情況", () => {
    expect(resolveDashboardRange("lastMonth", "2026-07-10")).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("上月：跨年邊界（今天在 1 月，上月應為去年 12 月）", () => {
    expect(resolveDashboardRange("lastMonth", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("上月：2 月（含閏年判斷）", () => {
    // 2024 是閏年，2 月有 29 天
    expect(resolveDashboardRange("lastMonth", "2024-03-05")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    // 2026 非閏年，2 月有 28 天
    expect(resolveDashboardRange("lastMonth", "2026-03-05")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("今年：一律曆年 1/1 起，不是 rolling 12 個月", () => {
    expect(resolveDashboardRange("thisYear", "2026-07-10")).toEqual({
      from: "2026-01-01",
      to: "2026-07-10",
    });
  });

  it("近一年：rolling 365 天，含頭尾", () => {
    const { from, to } = resolveDashboardRange("last365", "2026-07-10");
    expect(to).toBe("2026-07-10");
    // 含頭尾共 365 天
    const days =
      (Date.parse(to!) - Date.parse(from!)) / 86_400_000 + 1;
    expect(days).toBe(365);
    expect(from).toBe("2025-07-11");
  });

  it("全部：回傳空物件（不過濾）", () => {
    expect(resolveDashboardRange("all", "2026-07-10")).toEqual({});
  });
});

describe("dashboardRangeLabel", () => {
  it("五檔選項皆有中文標籤", () => {
    expect(dashboardRangeLabel("thisMonth")).toBe("本月");
    expect(dashboardRangeLabel("lastMonth")).toBe("上月");
    expect(dashboardRangeLabel("thisYear")).toBe("今年");
    expect(dashboardRangeLabel("last365")).toBe("近一年");
    expect(dashboardRangeLabel("all")).toBe("全部");
  });
});
