import { parseYaml, type MarkdownPostProcessorContext } from "obsidian";
import type InvRecordPlugin from "../main";
import { normalizeChartParams } from "./blockParams";
import { ChartRenderChild } from "./renderer";

/** ```invchart 區塊 → Chart.js 圖表（bar / line / pie / donut / bar-line） */
export function registerChartProcessor(plugin: InvRecordPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor(
    "invchart",
    (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      let raw: unknown;
      try {
        raw = parseYaml(source);
      } catch (e) {
        el.createDiv({
          cls: "inv-chart-status inv-chart-error",
          text: `invchart 區塊的 YAML 格式錯誤：${e instanceof Error ? e.message : String(e)}`,
        });
        return;
      }

      const result = normalizeChartParams(raw);
      if (!result.ok) {
        el.createDiv({
          cls: "inv-chart-status inv-chart-error",
          text: result.error,
        });
        return;
      }

      ctx.addChild(new ChartRenderChild(el, result.params, plugin));
    }
  );
}
