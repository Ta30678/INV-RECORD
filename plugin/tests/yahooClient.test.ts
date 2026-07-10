import { describe, expect, it, vi } from "vitest";
import { YahooClient } from "../src/yahoo/client";
import fixture2330 from "./fixtures/yahoo-2330-1d.json";

function makeClient(opts?: {
  fail?: () => boolean;
  ttlMs?: number;
}) {
  let now = 0;
  const fetchJson = vi.fn(async (url: string) => {
    if (opts?.fail?.()) throw new Error("network down");
    return fixture2330 as unknown;
  });
  const client = new YahooClient(fetchJson, opts?.ttlMs ?? 60_000, () => now);
  return {
    client,
    fetchJson,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const CHART_OPTS = { interval: "1d" as const, range: "1y" };

describe("YahooClient", () => {
  it("URL 帶 .TW 後綴與 interval/range", async () => {
    const { client, fetchJson } = makeClient();
    await client.getChart("2330", CHART_OPTS);
    expect(fetchJson).toHaveBeenCalledWith(
      "https://query1.finance.yahoo.com/v8/finance/chart/2330.TW?interval=1d&range=1y"
    );
  });

  it("TTL 內重複請求命中快取，fetchedAt 保留原抓取時間", async () => {
    const { client, fetchJson, advance } = makeClient({ ttlMs: 60_000 });
    const first = await client.getChart("2330", CHART_OPTS);
    advance(30_000);
    const r = await client.getChart("2330", CHART_OPTS);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(r.stale).toBe(false);
    expect(r.data.bars).toHaveLength(3);
    expect(r.fetchedAt).toBe(first.fetchedAt);
    expect(r.fetchedAt).toBe(0); // now() 從 0 開始，尚未 advance 時的抓取時刻
  });

  it("TTL 過期後重抓", async () => {
    const { client, fetchJson, advance } = makeClient({ ttlMs: 60_000 });
    await client.getChart("2330", CHART_OPTS);
    advance(61_000);
    await client.getChart("2330", CHART_OPTS);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("不同 interval/range 分開快取", async () => {
    const { client, fetchJson } = makeClient();
    await client.getChart("2330", CHART_OPTS);
    await client.getChart("2330", { interval: "1wk", range: "1y" });
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it("同時併發請求只發一次（in-flight 去重）", async () => {
    const { client, fetchJson } = makeClient();
    await Promise.all([
      client.getChart("2330", CHART_OPTS),
      client.getChart("2330", CHART_OPTS),
      client.getChart("2330", CHART_OPTS),
    ]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it("抓取失敗但有舊快取 → 回傳 stale 資料，fetchedAt 為舊快取的抓取時間", async () => {
    let failing = false;
    const { client, advance } = makeClient({ fail: () => failing });
    const first = await client.getChart("2330", CHART_OPTS);
    advance(61_000);
    failing = true;
    const r = await client.getChart("2330", CHART_OPTS);
    expect(r.stale).toBe(true);
    expect(r.data.bars).toHaveLength(3);
    expect(r.fetchedAt).toBe(first.fetchedAt);
  });

  it("抓取失敗且無快取 → 丟出錯誤", async () => {
    const { client } = makeClient({ fail: () => true });
    await expect(client.getChart("2330", CHART_OPTS)).rejects.toThrow(
      "network down"
    );
  });

  it("getQuote 用 meta.regularMarketPrice，並回傳 fetchedAt", async () => {
    const { client } = makeClient();
    const q = await client.getQuote("2330");
    expect(q.price).toBe(985);
    expect(q.fetchedAt).toBe(0);
  });

  it("不同 ticker 重抓時 fetchedAt 各自更新為當下時間", async () => {
    const { client, advance } = makeClient();
    const r1 = await client.getChart("2330", CHART_OPTS);
    advance(5_000);
    const r2 = await client.getChart("3661", CHART_OPTS);
    expect(r1.fetchedAt).toBe(0);
    expect(r2.fetchedAt).toBe(5_000);
  });
});
