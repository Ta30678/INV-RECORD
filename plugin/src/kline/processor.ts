import type { MarkdownPostProcessorContext } from "obsidian";
import type InvRecordPlugin from "../main";
import { parseKlineBlock } from "./blockParams";
import { KlineRenderChild } from "./renderer";

/** ```kline 區塊 → K 線圖 */
export function registerKlineProcessor(plugin: InvRecordPlugin): void {
  plugin.registerMarkdownCodeBlockProcessor(
    "kline",
    (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      try {
        const params = parseKlineBlock(source);
        ctx.addChild(new KlineRenderChild(el, params, plugin));
      } catch (e) {
        el.createDiv({
          cls: "inv-kline-status inv-kline-error",
          text: e instanceof Error ? e.message : String(e),
        });
      }
    }
  );
}
