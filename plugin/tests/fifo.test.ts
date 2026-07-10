import { describe, expect, it } from "vitest";
import { computeFifo, sortTrades } from "../src/trades/fifo";
import type { TradeRecord } from "../src/types";

function trade(partial: Partial<TradeRecord>): TradeRecord {
  return {
    filePath: partial.filePath ?? "t.md",
    date: partial.date ?? "2026-01-01",
    time: partial.time,
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

describe("computeFifo", () => {
  it("單買單賣全平：pnl = 淨收入 − 含費成本", () => {
    const r = computeFifo([
      trade({ date: "2026-01-05", action: "buy", qty: 1000, price: 100, fee: 143 }),
      trade({
        date: "2026-02-10",
        action: "sell",
        qty: 1000,
        price: 110,
        fee: 157,
        tax: 330,
      }),
    ]);
    expect(r.openLots.size).toBe(0);
    expect(r.realized).toHaveLength(1);
    const e = r.realized[0];
    expect(e.proceeds).toBeCloseTo(110000 - 157 - 330);
    expect(e.costBasis).toBeCloseTo(100000 + 143);
    expect(e.pnl).toBeCloseTo(110000 - 157 - 330 - 100143);
    expect(r.issues).toHaveLength(0);
  });

  it("分批買一次賣：FIFO 跨 lot 攤配", () => {
    const r = computeFifo([
      trade({ date: "2026-01-05", action: "buy", qty: 1000, price: 100 }),
      trade({ date: "2026-01-10", action: "buy", qty: 1000, price: 120 }),
      trade({ date: "2026-02-01", action: "sell", qty: 1500, price: 130 }),
    ]);
    expect(r.realized).toHaveLength(1);
    // 消耗第一批 1000 股 @100 + 第二批 500 股 @120
    expect(r.realized[0].costBasis).toBeCloseTo(1000 * 100 + 500 * 120);
    expect(r.realized[0].pnl).toBeCloseTo(1500 * 130 - 160000);
    // 剩第二批 500 股
    const lots = r.openLots.get("2330")!;
    expect(lots).toHaveLength(1);
    expect(lots[0].qty).toBe(500);
    expect(lots[0].costPerShare).toBeCloseTo(120);
  });

  it("賣超：只實現可覆蓋部分並記 issue，不做空", () => {
    const r = computeFifo([
      trade({ date: "2026-01-05", action: "buy", qty: 1000, price: 100 }),
      trade({
        date: "2026-02-01",
        action: "sell",
        qty: 1500,
        price: 110,
        fee: 150,
        tax: 495,
        filePath: "oversell.md",
      }),
    ]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].filePath).toBe("oversell.md");
    expect(r.realized[0].qty).toBe(1000);
    // 費稅按比例攤：只攤 1000/1500
    const feeTaxShare = ((150 + 495) / 1500) * 1000;
    expect(r.realized[0].proceeds).toBeCloseTo(1000 * 110 - feeTaxShare);
    expect(r.openLots.size).toBe(0);
  });

  it("完全沒持股就賣出：不產生 realized，記 issue", () => {
    const r = computeFifo([
      trade({ date: "2026-01-05", action: "sell", qty: 100, price: 50 }),
    ]);
    expect(r.realized).toHaveLength(0);
    expect(r.issues).toHaveLength(1);
  });

  it("多股票交錯互不影響", () => {
    const r = computeFifo([
      trade({ ticker: "2330", date: "2026-01-05", action: "buy", qty: 1000, price: 100 }),
      trade({ ticker: "3661", name: "世芯-KY", date: "2026-01-06", action: "buy", qty: 100, price: 2000 }),
      trade({ ticker: "2330", date: "2026-02-01", action: "sell", qty: 500, price: 110 }),
    ]);
    expect(r.realized).toHaveLength(1);
    expect(r.realized[0].ticker).toBe("2330");
    expect(r.openLots.get("2330")![0].qty).toBe(500);
    expect(r.openLots.get("3661")![0].qty).toBe(100);
    expect(r.names.get("3661")).toBe("世芯-KY");
  });

  it("同日多筆依 seq 排序", () => {
    const r = computeFifo([
      trade({ date: "2026-01-05", seq: 2, action: "sell", qty: 1000, price: 110, filePath: "b.md" }),
      trade({ date: "2026-01-05", seq: 1, action: "buy", qty: 1000, price: 100, filePath: "a.md" }),
    ]);
    expect(r.issues).toHaveLength(0);
    expect(r.realized).toHaveLength(1);
    expect(r.realized[0].pnl).toBeCloseTo(10000);
  });

  it("零股買賣", () => {
    const r = computeFifo([
      trade({ date: "2026-01-05", action: "buy", qty: 37, price: 985, fee: 20 }),
      trade({ date: "2026-03-01", action: "sell", qty: 37, price: 1050, fee: 20, tax: 116 }),
    ]);
    expect(r.realized[0].pnl).toBeCloseTo(
      37 * 1050 - 20 - 116 - (37 * 985 + 20)
    );
  });
});

describe("avgHoldingDays（加權平均持有天數）", () => {
  it("單批買單批賣：等於買賣日曆天差", () => {
    const r = computeFifo([
      trade({ date: "2026-01-01", action: "buy", qty: 1000, price: 100 }),
      trade({ date: "2026-01-11", action: "sell", qty: 1000, price: 110 }),
    ]);
    expect(r.realized[0].avgHoldingDays).toBeCloseTo(10);
  });

  it("一次賣出跨兩批不同買進日的 lot：依消耗股數加權平均", () => {
    const r = computeFifo([
      // lot1: 2026-01-01 買 1000 股，持有到賣出日 2026-01-31 → 30 天
      trade({ date: "2026-01-01", action: "buy", qty: 1000, price: 100 }),
      // lot2: 2026-01-21 買 1000 股，持有到賣出日 2026-01-31 → 10 天
      trade({ date: "2026-01-21", action: "buy", qty: 1000, price: 120 }),
      // 賣 1500 股：消耗 lot1 全部 1000 股 + lot2 500 股
      trade({ date: "2026-01-31", action: "sell", qty: 1500, price: 130 }),
    ]);
    expect(r.realized).toHaveLength(1);
    // (1000*30 + 500*10) / 1500 = (30000+5000)/1500 = 23.333...
    expect(r.realized[0].avgHoldingDays).toBeCloseTo((1000 * 30 + 500 * 10) / 1500);
  });

  it("同日買同日賣：持有天數為 0", () => {
    const r = computeFifo([
      trade({ date: "2026-01-05", time: "09:00", action: "buy", qty: 1000, price: 100 }),
      trade({ date: "2026-01-05", time: "13:00", action: "sell", qty: 1000, price: 101 }),
    ]);
    expect(r.realized[0].avgHoldingDays).toBe(0);
  });
});

describe("sortTrades", () => {
  it("date → seq → filePath 排序（皆無 time 時與現制相同，向下相容）", () => {
    const sorted = sortTrades([
      trade({ date: "2026-01-02", filePath: "b.md" }),
      trade({ date: "2026-01-02", filePath: "a.md" }),
      trade({ date: "2026-01-01", seq: 2 }),
      trade({ date: "2026-01-01", seq: 1 }),
    ]);
    expect(sorted.map((t) => `${t.date}#${t.seq}#${t.filePath}`)).toEqual([
      "2026-01-01#1#t.md",
      "2026-01-01#2#t.md",
      "2026-01-02#0#a.md",
      "2026-01-02#0#b.md",
    ]);
  });

  it("同日 time 混排：有 time 者先於缺 time 者，且依 time 排序", () => {
    const sorted = sortTrades([
      trade({ date: "2026-01-05", time: "14:00", filePath: "c-no-time.md" }),
      trade({ date: "2026-01-05", filePath: "no-time.md" }), // 缺 time → 視為 99:99
      trade({ date: "2026-01-05", time: "09:30", filePath: "b.md" }),
      trade({ date: "2026-01-05", time: "09:00", filePath: "a.md" }),
    ]);
    expect(sorted.map((t) => t.filePath)).toEqual([
      "a.md",
      "b.md",
      "c-no-time.md",
      "no-time.md",
    ]);
  });

  it("time 排序優先於 seq：seq 補登順序不影響真實成交時間排序", () => {
    // seq 暗示賣出（seq=1）比買進（seq=2）早建檔，但實際成交 time 買進較早
    const sorted = sortTrades([
      trade({ date: "2026-01-05", seq: 1, time: "10:00", action: "sell", filePath: "sell.md" }),
      trade({ date: "2026-01-05", seq: 2, time: "09:00", action: "buy", filePath: "buy.md" }),
    ]);
    expect(sorted.map((t) => t.filePath)).toEqual(["buy.md", "sell.md"]);
  });

  it("同鍵（同日同 seq 皆無 time）買進先於賣出，不再依賴檔名字典序", () => {
    // 檔名刻意讓賣出的字母序排在買進之前，驗證 tiebreak 是明確規則而非湊巧
    const sorted = sortTrades([
      trade({ date: "2026-01-05", action: "sell", filePath: "a-sell.md" }),
      trade({ date: "2026-01-05", action: "buy", filePath: "z-buy.md" }),
    ]);
    expect(sorted.map((t) => t.action)).toEqual(["buy", "sell"]);
  });
});

describe("computeFifo 與成交時間排序的交互作用", () => {
  it("同日先買後賣（有 time）：FIFO 正確配對，不觸發賣超", () => {
    const r = computeFifo([
      // seq 顛倒但 time 正確反映買在賣之前
      trade({ date: "2026-01-05", seq: 5, time: "09:00", action: "buy", qty: 1000, price: 100, filePath: "buy.md" }),
      trade({ date: "2026-01-05", seq: 1, time: "13:00", action: "sell", qty: 1000, price: 110, filePath: "sell.md" }),
    ]);
    expect(r.issues).toHaveLength(0);
    expect(r.realized).toHaveLength(1);
    expect(r.realized[0].pnl).toBeCloseTo(10000);
  });

  it("賣出 time 早於當日買進 time：視為真實賣超並記 issue", () => {
    const r = computeFifo([
      trade({ date: "2026-01-05", time: "13:00", action: "buy", qty: 1000, price: 100, filePath: "buy.md" }),
      trade({ date: "2026-01-05", time: "09:00", action: "sell", qty: 500, price: 110, filePath: "sell.md" }),
    ]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].filePath).toBe("sell.md");
    expect(r.realized).toHaveLength(0);
  });
});
