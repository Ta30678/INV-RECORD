import { describe, expect, it } from "vitest";
import { parseTradeFrontmatter } from "../src/trades/parser";

const base = {
  type: "trade",
  date: "2026-07-01",
  ticker: "2330",
  name: "台積電",
  action: "buy",
  qty: 1000,
  price: 985,
  fee: 1403,
  tax: 0,
};

describe("parseTradeFrontmatter", () => {
  it("合法買進", () => {
    const { trade, issues } = parseTradeFrontmatter(base, "40/a.md");
    expect(issues).toHaveLength(0);
    expect(trade).toMatchObject({
      date: "2026-07-01",
      ticker: "2330",
      name: "台積電",
      action: "buy",
      qty: 1000,
      price: 985,
      fee: 1403,
      tax: 0,
      seq: 0,
    });
  });

  it("非 trade 類型靜默略過", () => {
    const { trade, issues } = parseTradeFrontmatter(
      { type: "stock", ticker: "2330" },
      "30/b.md"
    );
    expect(trade).toBeNull();
    expect(issues).toHaveLength(0);
  });

  it("frontmatter undefined 靜默略過", () => {
    expect(parseTradeFrontmatter(undefined, "x.md").trade).toBeNull();
  });

  it("YAML 把 ticker 轉成數字時仍正確（String 雙保險）", () => {
    const { trade } = parseTradeFrontmatter(
      { ...base, ticker: 2330 },
      "40/a.md"
    );
    expect(trade?.ticker).toBe("2330");
  });

  it("YAML date 為 Date 物件時轉成字串", () => {
    const { trade } = parseTradeFrontmatter(
      { ...base, date: new Date(Date.UTC(2026, 6, 1)) },
      "40/a.md"
    );
    expect(trade?.date).toBe("2026-07-01");
  });

  it("fee/tax 缺少時預設 0", () => {
    const { trade, issues } = parseTradeFrontmatter(
      { ...base, fee: undefined, tax: undefined },
      "40/a.md"
    );
    expect(issues).toHaveLength(0);
    expect(trade?.fee).toBe(0);
    expect(trade?.tax).toBe(0);
  });

  it("name 缺少時用 ticker", () => {
    const { trade } = parseTradeFrontmatter({ ...base, name: undefined }, "a.md");
    expect(trade?.name).toBe("2330");
  });

  it("action 非 buy/sell 回報 issue", () => {
    const { trade, issues } = parseTradeFrontmatter(
      { ...base, action: "hold" },
      "40/a.md"
    );
    expect(trade).toBeNull();
    expect(issues.some((i) => i.message.includes("action"))).toBe(true);
  });

  it("qty ≤ 0 回報 issue", () => {
    const { trade, issues } = parseTradeFrontmatter(
      { ...base, qty: 0 },
      "40/a.md"
    );
    expect(trade).toBeNull();
    expect(issues.some((i) => i.message.includes("qty"))).toBe(true);
  });

  it("date 無法解析回報 issue", () => {
    const { issues } = parseTradeFrontmatter(
      { ...base, date: "七月一日" },
      "40/a.md"
    );
    expect(issues.some((i) => i.message.includes("date"))).toBe(true);
  });

  it("零股（qty 非千股整數）合法", () => {
    const { trade, issues } = parseTradeFrontmatter(
      { ...base, qty: 37 },
      "40/a.md"
    );
    expect(issues).toHaveLength(0);
    expect(trade?.qty).toBe(37);
  });
});
