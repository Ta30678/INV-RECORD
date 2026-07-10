import { App, PluginSettingTab, Setting } from "obsidian";
import type InvRecordPlugin from "./main";
import type { KlineRange } from "./types";

export interface InvRecordSettings {
  /** 交易紀錄資料夾（vault 相對路徑） */
  tradesFolder: string;
  /** 個股筆記資料夾（scaffold 用） */
  stocksFolder: string;
  /** 總經筆記資料夾（scaffold 用） */
  macroFolder: string;
  /** 自選股（儀表板顯示報價；持倉股票自動包含） */
  watchlist: string[];
  defaultRange: KlineRange;
  cacheTtlMinutes: number;
  /** true = 台式紅漲綠跌；false = 美式綠漲紅跌 */
  taiwanColors: boolean;
  feeRate: number;
  feeDiscount: number;
  taxRate: number;
}

export const DEFAULT_SETTINGS: InvRecordSettings = {
  tradesFolder: "40-交易紀錄",
  stocksFolder: "30-個股",
  macroFolder: "10-總經",
  watchlist: [],
  defaultRange: "1y",
  cacheTtlMinutes: 15,
  taiwanColors: true,
  feeRate: 0.001425,
  feeDiscount: 1,
  taxRate: 0.003,
};

const RANGE_OPTIONS: Record<KlineRange, string> = {
  "1mo": "1 個月",
  "3mo": "3 個月",
  "6mo": "6 個月",
  "1y": "1 年",
  "2y": "2 年",
  "5y": "5 年",
  max: "全部",
};

export class InvRecordSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: InvRecordPlugin
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("資料夾").setHeading();

    new Setting(containerEl)
      .setName("交易紀錄資料夾")
      .setDesc("儀表板會掃描此資料夾內 type: trade 的筆記")
      .addText((t) =>
        t
          .setPlaceholder(DEFAULT_SETTINGS.tradesFolder)
          .setValue(this.plugin.settings.tradesFolder)
          .onChange(async (v) => {
            this.plugin.settings.tradesFolder = v.trim() || DEFAULT_SETTINGS.tradesFolder;
            await this.plugin.saveSettings();
            this.plugin.tradeStore.rescan();
          })
      );

    new Setting(containerEl)
      .setName("個股筆記資料夾")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.stocksFolder)
          .onChange(async (v) => {
            this.plugin.settings.stocksFolder = v.trim() || DEFAULT_SETTINGS.stocksFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("總經筆記資料夾")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.macroFolder)
          .onChange(async (v) => {
            this.plugin.settings.macroFolder = v.trim() || DEFAULT_SETTINGS.macroFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("K 線圖").setHeading();

    new Setting(containerEl)
      .setName("預設時間範圍")
      .setDesc("kline 區塊未指定 range 時使用")
      .addDropdown((d) => {
        for (const [value, label] of Object.entries(RANGE_OPTIONS)) {
          d.addOption(value, label);
        }
        d.setValue(this.plugin.settings.defaultRange).onChange(async (v) => {
          this.plugin.settings.defaultRange = v as KlineRange;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("台式紅漲綠跌")
      .setDesc("關閉後改用美式綠漲紅跌")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.taiwanColors).onChange(async (v) => {
          this.plugin.settings.taiwanColors = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("報價快取時間（分鐘）")
      .setDesc("時間內重複開啟同一張圖不重新向 Yahoo 請求")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.cacheTtlMinutes))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) {
              this.plugin.settings.cacheTtlMinutes = n;
              this.plugin.yahoo.ttlMs = n * 60_000;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl).setName("自選股").setHeading();

    new Setting(containerEl)
      .setName("自選股清單")
      .setDesc("逗號分隔，例如：2330, 3661, 0050。持倉股票會自動顯示，不需重複填。")
      .addTextArea((t) =>
        t
          .setValue(this.plugin.settings.watchlist.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.watchlist = v
              .split(/[,，\s]+/)
              .map((s) => s.trim().toUpperCase().replace(/\.(TW|TWO)$/i, ""))
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("費用試算（新增交易時預填）").setHeading();

    new Setting(containerEl)
      .setName("手續費率")
      .setDesc("券商牌告費率，台股一般為 0.001425")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.feeRate)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.feeRate = n;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName("手續費折扣")
      .setDesc("例如 0.6 = 六折；1 = 無折扣")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.feeDiscount))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0 && n <= 1) {
              this.plugin.settings.feeDiscount = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("證交稅率")
      .setDesc("一般股票 0.003；ETF 0.001（請自行調整）")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.taxRate)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.taxRate = n;
            await this.plugin.saveSettings();
          }
        })
      );
  }
}
