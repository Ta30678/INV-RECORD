import { describe, expect, it } from "vitest";
import {
  KlineParamsError,
  parseKlineBlock,
  periodLabel,
  periodToInterval,
} from "../src/kline/blockParams";

describe("parseKlineBlock", () => {
  it("最簡形式：只有代號", () => {
    expect(parseKlineBlock("2330\n")).toEqual({
      ticker: "2330",
      period: "D",
      range: null,
    });
  });

  it("完整形式：period 與 range", () => {
    expect(parseKlineBlock("2330\nperiod: W\nrange: 1y\n")).toEqual({
      ticker: "2330",
      period: "W",
      range: "1y",
    });
  });

  it("代號接受 .TW 後綴並正規化", () => {
    expect(parseKlineBlock("2330.TW").ticker).toBe("2330");
  });

  it("上櫃代號保留 .TWO 後綴", () => {
    expect(parseKlineBlock("6488.TWO").ticker).toBe("6488.TWO");
    expect(parseKlineBlock("6488.two").ticker).toBe("6488.TWO");
    expect(parseKlineBlock("ticker: 6488.two").ticker).toBe("6488.TWO");
  });

  it("period 大小寫不拘、支援中文", () => {
    expect(parseKlineBlock("2330\nperiod: m").period).toBe("M");
    expect(parseKlineBlock("2330\n週期: 月").period).toBe("M");
  });

  it("未知 key 忽略", () => {
    expect(parseKlineBlock("2330\nfoo: bar").ticker).toBe("2330");
  });

  it("空區塊丟錯", () => {
    expect(() => parseKlineBlock("")).toThrow(KlineParamsError);
  });

  it("無效 period / range 丟錯", () => {
    expect(() => parseKlineBlock("2330\nperiod: X")).toThrow(KlineParamsError);
    expect(() => parseKlineBlock("2330\nrange: 7y")).toThrow(KlineParamsError);
  });
});

describe("period 轉換", () => {
  it("period → yahoo interval", () => {
    expect(periodToInterval("D")).toBe("1d");
    expect(periodToInterval("W")).toBe("1wk");
    expect(periodToInterval("M")).toBe("1mo");
  });
  it("period → 中文標籤", () => {
    expect(periodLabel("W")).toBe("週K");
  });
});
