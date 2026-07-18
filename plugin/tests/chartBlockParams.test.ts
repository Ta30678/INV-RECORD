import { describe, expect, it } from "vitest";
import { normalizeChartParams } from "../src/charts/blockParams";

function expectOk(raw: unknown) {
  const result = normalizeChartParams(raw);
  if (!result.ok) {
    throw new Error(`預期成功卻失敗：${result.error}`);
  }
  return result.params;
}

function expectErr(raw: unknown): string {
  const result = normalizeChartParams(raw);
  if (result.ok) {
    throw new Error("預期失敗卻成功");
  }
  return result.error;
}

const baseBar = {
  type: "bar",
  title: "台積電 CoWoS 月產能擴張",
  labels: ["2024 年底", "2026 年中"],
  series: [{ name: "月產能", data: [3.5, 7.75] }],
  unit: "萬片/月",
  source: "TrendForce 2026-06-15",
  asOf: "2026-06",
};

describe("normalizeChartParams：五種 type 正常案例", () => {
  it("bar", () => {
    const p = expectOk(baseBar);
    expect(p.type).toBe("bar");
    expect(p.series[0].data).toEqual([3.5, 7.75]);
    expect(p.height).toBe(300);
    expect(p.stacked).toBe(false);
    expect(p.horizontal).toBe(false);
  });

  it("line", () => {
    const p = expectOk({
      ...baseBar,
      type: "line",
      title: "毛利率逐季",
    });
    expect(p.type).toBe("line");
  });

  it("pie", () => {
    const p = expectOk({
      type: "pie",
      title: "台積電營收結構（2026 Q1）",
      labels: ["HPC", "智慧型手機", "IoT", "車用", "其他", "消費性電子"],
      series: [{ name: "營收佔比", data: [61, 26, 6, 4, 2, 1] }],
      unit: "%",
      source: "台積電 2026 Q1 法說會",
      asOf: "2026 Q1",
    });
    expect(p.type).toBe("pie");
    expect(p.series).toHaveLength(1);
  });

  it("donut", () => {
    const p = expectOk({
      type: "donut",
      title: "CoWoS 產能分配",
      labels: ["客戶A", "客戶B", "客戶C"],
      series: [{ name: "佔比", data: [50, 30, 20] }],
      unit: "%",
      source: "TrendForce",
      asOf: "2026-06",
    });
    expect(p.type).toBe("donut");
  });

  it("bar-line", () => {
    const p = expectOk({
      type: "bar-line",
      title: "台積電 月營收與年增率",
      labels: ["2026-01", "2026-02", "2026-03"],
      series: [
        { name: "月營收", type: "bar", data: [2932, 2600, 2853] },
        { name: "YoY", type: "line", yAxis: "right", data: [35.9, 43.1, 46.5] },
      ],
      unit: "億元",
      unitRight: "%",
      source: "台積電自結月營收",
      asOf: "2026-06",
    });
    expect(p.type).toBe("bar-line");
    expect(p.series[0].type).toBe("bar");
    expect(p.series[0].yAxis).toBe("left");
    expect(p.series[1].type).toBe("line");
    expect(p.series[1].yAxis).toBe("right");
    expect(p.unitRight).toBe("%");
  });
});

describe("normalizeChartParams：raw 非物件", () => {
  it("null", () => {
    expect(normalizeChartParams(null).ok).toBe(false);
  });
  it("字串", () => {
    expect(normalizeChartParams("not an object").ok).toBe(false);
  });
  it("undefined（空區塊 parseYaml 結果）", () => {
    expect(normalizeChartParams(undefined).ok).toBe(false);
  });
  it("陣列", () => {
    expect(normalizeChartParams([1, 2, 3]).ok).toBe(false);
  });
});

describe("normalizeChartParams：各必填欄位缺漏", () => {
  it("缺 type", () => {
    const { type: _omit, ...rest } = baseBar;
    expect(expectErr(rest)).toContain("type");
  });

  it("缺 title", () => {
    const { title: _omit, ...rest } = baseBar;
    expect(expectErr(rest)).toContain("title");
  });

  it("缺 labels", () => {
    const { labels: _omit, ...rest } = baseBar;
    expect(expectErr(rest)).toContain("labels");
  });

  it("缺 series", () => {
    const { series: _omit, ...rest } = baseBar;
    expect(expectErr(rest)).toContain("series");
  });

  it("缺 source", () => {
    const { source: _omit, ...rest } = baseBar;
    expect(expectErr(rest)).toContain("source");
  });

  it("缺 asOf", () => {
    const { asOf: _omit, ...rest } = baseBar;
    expect(expectErr(rest)).toContain("asOf");
  });

  it("series[].name 缺漏", () => {
    const err = expectErr({
      ...baseBar,
      series: [{ data: [1, 2] }],
    });
    expect(err).toContain("name");
  });

  it("series[].data 缺漏", () => {
    const err = expectErr({
      ...baseBar,
      series: [{ name: "月產能" }],
    });
    expect(err).toContain("data");
  });
});

describe("normalizeChartParams：data 長度須等於 labels 長度", () => {
  it("data 比 labels 短", () => {
    const err = expectErr({
      ...baseBar,
      labels: ["2024 年底", "2026 年中", "2026 年底"],
      series: [{ name: "月產能", data: [3.5, 7.75] }],
    });
    expect(err).toContain("長度");
  });

  it("data 比 labels 長", () => {
    const err = expectErr({
      ...baseBar,
      labels: ["2024 年底"],
      series: [{ name: "月產能", data: [3.5, 7.75] }],
    });
    expect(err).toContain("長度");
  });
});

describe("normalizeChartParams：type 合法值", () => {
  it("未知 type", () => {
    const err = expectErr({ ...baseBar, type: "scatter" });
    expect(err).toContain("type");
  });
});

describe("normalizeChartParams：pie/donut 恰一組 series", () => {
  it("pie 多組 series 應報錯", () => {
    const err = expectErr({
      type: "pie",
      title: "結構",
      labels: ["A", "B"],
      series: [
        { name: "s1", data: [1, 2] },
        { name: "s2", data: [3, 4] },
      ],
      source: "來源",
      asOf: "2026-06",
    });
    expect(err).toContain("series");
  });
});

describe("normalizeChartParams：height 夾限 160~600，預設 300", () => {
  it("過小夾到 160", () => {
    const p = expectOk({ ...baseBar, height: 50 });
    expect(p.height).toBe(160);
  });

  it("過大夾到 600", () => {
    const p = expectOk({ ...baseBar, height: 9999 });
    expect(p.height).toBe(600);
  });

  it("未填預設 300", () => {
    const p = expectOk(baseBar);
    expect(p.height).toBe(300);
  });

  it("非數字報錯", () => {
    const err = expectErr({ ...baseBar, height: "big" });
    expect(err).toContain("height");
  });
});

describe("normalizeChartParams：bar-line 右軸與 unitRight", () => {
  it("bar-line 可用 yAxis: right 與 unitRight（成功）", () => {
    const p = expectOk({
      type: "bar-line",
      title: "量與率",
      labels: ["1月", "2月"],
      series: [
        { name: "量", type: "bar", data: [10, 20] },
        { name: "率", type: "line", yAxis: "right", data: [1.1, 2.2] },
      ],
      unit: "億元",
      unitRight: "%",
      source: "來源",
      asOf: "2026-06",
    });
    expect(p.unitRight).toBe("%");
    expect(p.series[1].yAxis).toBe("right");
  });
});

describe("normalizeChartParams：非 bar-line 使用 series[].type 或 yAxis 的錯誤", () => {
  it("bar 圖的 series 使用 type 應報錯", () => {
    const err = expectErr({
      ...baseBar,
      type: "bar",
      series: [{ name: "月產能", type: "bar", data: [3.5, 7.75] }],
    });
    expect(err).toContain("type");
  });

  it("bar 圖的 series 使用 yAxis: right 應報錯", () => {
    const err = expectErr({
      ...baseBar,
      type: "bar",
      series: [{ name: "月產能", yAxis: "right", data: [3.5, 7.75] }],
    });
    expect(err).toContain("yAxis");
  });

  it("bar 圖使用 unitRight 應報錯", () => {
    const err = expectErr({ ...baseBar, type: "bar", unitRight: "%" });
    expect(err).toContain("unitRight");
  });

  it("bar-line 圖每組 series 缺 type 應報錯", () => {
    const err = expectErr({
      type: "bar-line",
      title: "量與率",
      labels: ["1月", "2月"],
      series: [{ name: "量", data: [10, 20] }],
      source: "來源",
      asOf: "2026-06",
    });
    expect(err).toContain("type");
  });
});
