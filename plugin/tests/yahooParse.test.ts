import { describe, expect, it } from "vitest";
import {
  normalizeTicker,
  parseChartResponse,
  toTaiwanDateString,
  toYahooSymbol,
  YahooParseError,
} from "../src/yahoo/parse";
import fixture2330 from "./fixtures/yahoo-2330-1d.json";
import fixtureNulls from "./fixtures/yahoo-nulls.json";
import fixtureError from "./fixtures/yahoo-error.json";

describe("toTaiwanDateString", () => {
  it("台股開盤時間（01:00 UTC）對應正確台灣日期", () => {
    expect(toTaiwanDateString(Date.UTC(2026, 6, 1, 1, 0, 0) / 1000)).toBe(
      "2026-07-01"
    );
  });

  it("UTC 晚間時間 +8h 後跨到隔天（台灣日期）", () => {
    // 2026-06-30 21:00 UTC = 2026-07-01 05:00 台灣
    expect(toTaiwanDateString(Date.UTC(2026, 5, 30, 21, 0, 0) / 1000)).toBe(
      "2026-07-01"
    );
  });
});

describe("parseChartResponse", () => {
  it("解析正常回應：bars 與 meta", () => {
    const { bars, meta } = parseChartResponse(fixture2330);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toEqual({
      time: "2026-06-29",
      open: 960,
      high: 970,
      low: 955,
      close: 968,
      volume: 21000000,
    });
    expect(bars[2].time).toBe("2026-07-01");
    expect(meta.symbol).toBe("2330.TW");
    expect(meta.regularMarketPrice).toBe(985);
    expect(meta.previousClose).toBe(975);
    expect(meta.currency).toBe("TWD");
    expect(meta.regularMarketTime).toBe(1782885600);
  });

  it("過濾 OHLC 含 null 的 bar，volume null 補 0", () => {
    const { bars, meta } = parseChartResponse(fixtureNulls);
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.time)).toEqual(["2026-06-29", "2026-07-01"]);
    expect(bars[1].volume).toBe(0);
    // fixture 沒有 regularMarketTime 欄位 → 取不到時為 null，不做假設
    expect(meta.regularMarketTime).toBeNull();
  });

  it("Yahoo error 回應丟出 YahooParseError", () => {
    expect(() => parseChartResponse(fixtureError)).toThrow(YahooParseError);
    expect(() => parseChartResponse(fixtureError)).toThrow(/delisted/);
  });

  it("空物件丟出 YahooParseError", () => {
    expect(() => parseChartResponse({})).toThrow(YahooParseError);
  });
});

describe("ticker/symbol 轉換", () => {
  it("純代號補 .TW", () => {
    expect(toYahooSymbol("2330")).toBe("2330.TW");
    expect(toYahooSymbol("0050")).toBe("0050.TW");
  });
  it("已含後綴不重複補", () => {
    expect(toYahooSymbol("2330.TW")).toBe("2330.TW");
    expect(toYahooSymbol("6488.TWO")).toBe("6488.TWO");
  });
  it("normalizeTicker 去除後綴、trim、大寫", () => {
    expect(normalizeTicker(" 2330.TW ")).toBe("2330");
    expect(normalizeTicker("6488.two")).toBe("6488");
    expect(normalizeTicker("0050")).toBe("0050");
  });
});
