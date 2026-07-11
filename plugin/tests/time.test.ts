import { describe, expect, it } from "vitest";
import {
  formatTaiwanDateTime,
  formatTaiwanDateTimeShort,
  isTaiwanMarketHours,
  marketSessionSuffix,
  taiwanNowString,
  taiwanToday,
  toTaiwanDateString,
} from "../src/utils/time";

describe("taiwanToday", () => {
  it("台灣時間 07:59（跨日前）仍算前一天", () => {
    // 台灣 2026-01-02 07:59 = UTC 2026-01-01 23:59
    const ms = Date.UTC(2026, 0, 1, 23, 59, 0);
    expect(taiwanToday(ms)).toBe("2026-01-02");
  });

  it("台灣時間 08:01（跨日後）算當天，不會被 UTC 誤標成前一天", () => {
    // 台灣 2026-01-02 08:01 = UTC 2026-01-02 00:01；若誤用 UTC 日期會得到 01-02（本例剛好同日）
    // 用更接近午夜的案例驗證：台灣 00:01 = UTC 前一日 16:01，UTC 日期會誤判為前一天
    const ms = Date.UTC(2026, 0, 1, 16, 1, 0); // 台灣 2026-01-02 00:01
    expect(taiwanToday(ms)).toBe("2026-01-02");
    // 若誤用 new Date(ms).toISOString().slice(0,10) 會得到 '2026-01-01'（跨日 bug）
    expect(new Date(ms).toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("跨年邊界：台灣 1/1 凌晨（UTC 仍是前一年 12/31）", () => {
    // 台灣 2027-01-01 01:00 = UTC 2026-12-31 17:00
    const ms = Date.UTC(2026, 11, 31, 17, 0, 0);
    expect(taiwanToday(ms)).toBe("2027-01-01");
  });

  it("預設使用 Date.now()", () => {
    expect(taiwanToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("taiwanNowString", () => {
  it("格式為 YYYY-MM-DD HH:mm（台灣時間）", () => {
    // 台灣 2026-07-11 14:32 = UTC 2026-07-11 06:32
    const ms = Date.UTC(2026, 6, 11, 6, 32, 0);
    expect(taiwanNowString(ms)).toBe("2026-07-11 14:32");
  });

  it("跨日邊界：UTC 前一日 16:05 = 台灣 00:05", () => {
    const ms = Date.UTC(2026, 6, 10, 16, 5, 0);
    expect(taiwanNowString(ms)).toBe("2026-07-11 00:05");
  });
});

describe("toTaiwanDateString（沿用既有 Yahoo bar 邏輯）", () => {
  it("台股開盤時間（01:00 UTC）對應正確台灣日期", () => {
    expect(toTaiwanDateString(Date.UTC(2026, 6, 1, 1, 0, 0) / 1000)).toBe(
      "2026-07-01"
    );
  });

  it("UTC 晚間時間 +8h 後跨到隔天（台灣日期）", () => {
    expect(toTaiwanDateString(Date.UTC(2026, 5, 30, 21, 0, 0) / 1000)).toBe(
      "2026-07-01"
    );
  });
});

describe("formatTaiwanDateTime / formatTaiwanDateTimeShort", () => {
  it("formatTaiwanDateTime 回傳完整格式", () => {
    const ms = Date.UTC(2026, 6, 10, 6, 32, 0); // 台灣 2026-07-10 14:32
    expect(formatTaiwanDateTime(ms)).toBe("2026-07-10 14:32");
  });

  it("同年時 short 格式省略年份", () => {
    const ms = Date.UTC(2026, 6, 10, 6, 32, 0); // 台灣 2026-07-10 14:32
    const ref = Date.UTC(2026, 6, 11, 6, 0, 0); // 同年基準
    expect(formatTaiwanDateTimeShort(ms, ref)).toBe("07-10 14:32");
  });

  it("跨年時 short 格式仍顯示完整年份", () => {
    const ms = Date.UTC(2025, 11, 31, 15, 0, 0); // 台灣 2025-12-31 23:00
    const ref = Date.UTC(2026, 0, 5, 2, 0, 0); // 台灣 2026-01-05 10:00（基準年為 2026）
    expect(formatTaiwanDateTimeShort(ms, ref)).toBe("2025-12-31 23:00");
  });
});

describe("isTaiwanMarketHours / marketSessionSuffix", () => {
  it("09:00 台灣時間屬於盤中（含頭）", () => {
    const sec = Date.UTC(2026, 6, 10, 1, 0, 0) / 1000; // 台灣 09:00
    expect(isTaiwanMarketHours(sec)).toBe(true);
    expect(marketSessionSuffix(sec)).toBe("（盤中）");
  });

  it("13:30 收盤撮合時點判為收盤（Yahoo 盤後 regularMarketTime 停在此刻）", () => {
    const sec = Date.UTC(2026, 6, 10, 5, 30, 0) / 1000; // 台灣 13:30
    expect(isTaiwanMarketHours(sec)).toBe(false);
    expect(marketSessionSuffix(sec)).toBe("（收盤）");
  });

  it("13:29 台灣時間仍屬盤中", () => {
    const sec = Date.UTC(2026, 6, 10, 5, 29, 0) / 1000; // 台灣 13:29
    expect(isTaiwanMarketHours(sec)).toBe(true);
  });

  it("13:31 台灣時間已收盤", () => {
    const sec = Date.UTC(2026, 6, 10, 5, 31, 0) / 1000; // 台灣 13:31
    expect(isTaiwanMarketHours(sec)).toBe(false);
    expect(marketSessionSuffix(sec)).toBe("（收盤）");
  });

  it("08:59 台灣時間尚未開盤（視為收盤後狀態）", () => {
    const sec = Date.UTC(2026, 6, 10, 0, 59, 0) / 1000; // 台灣 08:59
    expect(isTaiwanMarketHours(sec)).toBe(false);
  });

  it("regularMarketTime 為 null 時不做假設，回傳空字串", () => {
    expect(marketSessionSuffix(null)).toBe("");
  });
});
