import type {
  ChartBlockParams,
  ChartSeriesParams,
  ChartSeriesType,
  ChartType,
  ChartYAxis,
} from "../types";
import { taiwanDateStringFromMs } from "../utils/time";

/**
 * 純函式：驗證並正規化 ```invchart 區塊已由 Obsidian `parseYaml` 解析出的物件。
 * 不 throw——一律回傳 { ok, ... }，錯誤訊息一律繁體中文（含具體欄位名），
 * 供 processor 層直接在區塊位置渲染，不得讓整篇筆記渲染失敗。
 * 規格見 docs/圖表語法.md（唯一權威規格）。
 */

export type NormalizeChartResult =
  | { ok: true; params: ChartBlockParams }
  | { ok: false; error: string };

const CHART_TYPES: ChartType[] = ["bar", "line", "pie", "donut", "bar-line"];
const SERIES_TYPES: ChartSeriesType[] = ["bar", "line"];
const Y_AXES: ChartYAxis[] = ["left", "right"];

const MIN_HEIGHT = 160;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 300;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * string / number / Date 一律轉成顯示字串（YAML 可能把裸日期如 2026-07-09
 * 解析成 Date 物件，比照 trades/parser.ts 的 asDateString 處理方式）。
 * 空字串視為未填。
 */
function coerceString(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    return s.length > 0 ? s : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (v instanceof Date && !isNaN(v.getTime())) {
    return taiwanDateStringFromMs(v.getTime());
  }
  return null;
}

function coerceNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function coerceBool(v: unknown, field: string, errors: string[]): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  errors.push(`「${field}」需為布林值（true/false）`);
  return false;
}

export function normalizeChartParams(raw: unknown): NormalizeChartResult {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      error: "invchart 內容不是合法的 YAML 物件（需為 key: value 格式）",
    };
  }

  const errors: string[] = [];

  // ── type ──
  const typeRaw = raw.type;
  let type: ChartType | null = null;
  if (typeRaw === undefined || typeRaw === null || typeRaw === "") {
    errors.push("缺少必填欄位「type」");
  } else if (
    typeof typeRaw !== "string" ||
    !CHART_TYPES.includes(typeRaw as ChartType)
  ) {
    errors.push(
      `type 不合法（收到「${String(typeRaw)}」），須為 ${CHART_TYPES.join(" / ")} 其中之一`
    );
  } else {
    type = typeRaw as ChartType;
  }
  const isBarLine = type === "bar-line";
  const isPieLike = type === "pie" || type === "donut";

  // ── title ──
  const title = coerceString(raw.title);
  if (title === null) errors.push("缺少必填欄位「title」");

  // ── labels ──
  let labels: string[] | null = null;
  if (raw.labels === undefined || raw.labels === null) {
    errors.push("缺少必填欄位「labels」");
  } else if (!Array.isArray(raw.labels) || raw.labels.length === 0) {
    errors.push("labels 需為非空陣列");
  } else {
    const coerced = raw.labels.map((l) => coerceString(l));
    if (coerced.some((l) => l === null)) {
      errors.push("labels 內含無法辨識的項目（需為字串或數字）");
    } else {
      labels = coerced as string[];
    }
  }

  // ── series ──
  const series: ChartSeriesParams[] = [];
  if (raw.series === undefined || raw.series === null) {
    errors.push("缺少必填欄位「series」");
  } else if (!Array.isArray(raw.series) || raw.series.length === 0) {
    errors.push("series 需為非空陣列");
  } else {
    if (isPieLike && raw.series.length !== 1) {
      errors.push(`${type} 圖只能有一組 series（目前 ${raw.series.length} 組）`);
    }

    raw.series.forEach((entry, i) => {
      const fallbackLabel = `series 第 ${i + 1} 筆`;
      if (!isPlainObject(entry)) {
        errors.push(`${fallbackLabel} 格式錯誤，需為物件`);
        return;
      }

      const name = coerceString(entry.name);
      if (name === null) {
        errors.push(`${fallbackLabel} 缺少必填欄位「name」`);
      }
      const displayName = name ?? fallbackLabel;

      let data: number[] | null = null;
      if (entry.data === undefined || entry.data === null) {
        errors.push(`「${displayName}」缺少必填欄位「data」`);
      } else if (!Array.isArray(entry.data) || entry.data.length === 0) {
        errors.push(`「${displayName}」的 data 需為非空數字陣列`);
      } else {
        const nums = entry.data.map((d) => coerceNumber(d));
        if (nums.some((n) => n === null)) {
          errors.push(`「${displayName}」的 data 內含非數字項目`);
        } else {
          data = nums as number[];
          if (labels && data.length !== labels.length) {
            errors.push(
              `「${displayName}」的 data 長度（${data.length}）與 labels 長度（${labels.length}）不符`
            );
          }
        }
      }

      // series[].type：僅 bar-line 圖可用，且該圖每組 series 皆為必填
      let seriesType: ChartSeriesType | undefined;
      if (entry.type !== undefined && entry.type !== null) {
        if (!isBarLine) {
          errors.push(
            `「${displayName}」不可使用 type 欄位（series[].type 僅限 bar-line 圖使用）`
          );
        } else if (
          typeof entry.type !== "string" ||
          !SERIES_TYPES.includes(entry.type as ChartSeriesType)
        ) {
          errors.push(`「${displayName}」的 type 不合法，須為 bar 或 line`);
        } else {
          seriesType = entry.type as ChartSeriesType;
        }
      } else if (isBarLine) {
        errors.push(
          `「${displayName}」缺少必填欄位「type」（bar-line 圖每組 series 須指定 bar 或 line）`
        );
      }

      // series[].yAxis：預設 left；right 僅 bar-line 圖可用
      let yAxis: ChartYAxis = "left";
      if (entry.yAxis !== undefined && entry.yAxis !== null) {
        if (
          typeof entry.yAxis !== "string" ||
          !Y_AXES.includes(entry.yAxis as ChartYAxis)
        ) {
          errors.push(`「${displayName}」的 yAxis 不合法，須為 left 或 right`);
        } else if (entry.yAxis === "right" && !isBarLine) {
          errors.push(`「${displayName}」的 yAxis: right 僅限 bar-line 圖使用`);
        } else {
          yAxis = entry.yAxis as ChartYAxis;
        }
      }

      if (name !== null && data !== null) {
        series.push({ name, data, type: seriesType, yAxis });
      }
    });
  }

  // ── unit / unitRight ──
  let unit: string | undefined;
  if (raw.unit !== undefined && raw.unit !== null) {
    const u = coerceString(raw.unit);
    if (u === null) {
      errors.push("unit 需為字串");
    } else {
      unit = u;
    }
  }

  let unitRight: string | undefined;
  if (raw.unitRight !== undefined && raw.unitRight !== null) {
    if (!isBarLine) {
      errors.push("unitRight 僅限 bar-line 圖使用");
    }
    const ur = coerceString(raw.unitRight);
    if (ur === null) {
      errors.push("unitRight 需為字串");
    } else {
      unitRight = ur;
    }
  }

  // ── source / asOf ──
  const source = coerceString(raw.source);
  if (source === null) errors.push("缺少必填欄位「source」");

  const asOf = coerceString(raw.asOf);
  if (asOf === null) errors.push("缺少必填欄位「asOf」");

  // ── stacked / horizontal ──
  const stacked = coerceBool(raw.stacked, "stacked", errors);
  const horizontal = coerceBool(raw.horizontal, "horizontal", errors);

  // ── colors ──
  let colors: string[] | undefined;
  if (raw.colors !== undefined && raw.colors !== null) {
    if (
      !Array.isArray(raw.colors) ||
      raw.colors.some((c) => typeof c !== "string" || c.trim() === "")
    ) {
      errors.push("colors 需為色票字串陣列");
    } else {
      colors = raw.colors as string[];
    }
  }

  // ── height：夾限 160~600，預設 300 ──
  let height = DEFAULT_HEIGHT;
  if (raw.height !== undefined && raw.height !== null) {
    const h = coerceNumber(raw.height);
    if (h === null) {
      errors.push("height 需為數字（160~600）");
    } else {
      height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h));
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join("；") };
  }

  return {
    ok: true,
    params: {
      type: type!,
      title: title!,
      labels: labels!,
      series,
      unit,
      unitRight,
      source: source!,
      asOf: asOf!,
      stacked,
      horizontal,
      colors,
      height,
    },
  };
}
