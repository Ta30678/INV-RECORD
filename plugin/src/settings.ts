import { App, Notice, PluginSettingTab, Setting, type TextComponent } from "obsidian";
import type InvRecordPlugin from "./main";
import type { DashboardRangeKey } from "./trades/portfolio";
import type { KlineRange } from "./types";
import { normalizeTicker } from "./yahoo/parse";

export interface InvRecordSettings {
  /** 交易紀錄資料夾（vault 相對路徑） */
  tradesFolder: string;
  /** 個股筆記資料夾（scaffold 用） */
  stocksFolder: string;
  /** 題材筆記資料夾（scaffold 用） */
  themeFolder: string;
  /** 總經筆記資料夾（scaffold 用） */
  macroFolder: string;
  /** 自選股（儀表板顯示報價；持倉股票自動包含） */
  watchlist: string[];
  /** 儀表板已實現損益的時間範圍選擇（記住使用者上次選擇） */
  dashboardRange: DashboardRangeKey;
  defaultRange: KlineRange;
  cacheTtlMinutes: number;
  /** true = 台式紅漲綠跌；false = 美式綠漲紅跌 */
  taiwanColors: boolean;
  feeRate: number;
  feeDiscount: number;
  taxRate: number;
  /** 整股最低手續費（元），預設 20 */
  minFee: number;
  /** 零股最低手續費（元），依券商而異，預設 1 */
  oddLotMinFee: number;
}

export const DEFAULT_SETTINGS: InvRecordSettings = {
  tradesFolder: "40-交易紀錄",
  stocksFolder: "30-個股",
  themeFolder: "20-題材",
  macroFolder: "10-總經",
  watchlist: [],
  dashboardRange: "thisYear",
  defaultRange: "1y",
  cacheTtlMinutes: 15,
  taiwanColors: true,
  feeRate: 0.001425,
  feeDiscount: 1,
  taxRate: 0.003,
  minFee: 20,
  oddLotMinFee: 1,
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

  /**
   * 數值欄位驗證失敗時的共用回饋：原本靜默忽略會讓輸入框留著錯誤字串、
   * 使用者不知道值沒被採用；改成跳 Notice 並把欄位還原成目前生效的值。
   */
  private rejectInvalidNumber(t: TextComponent, label: string, revertTo: number): void {
    new Notice(`${label}輸入無效，已還原為 ${revertTo}`);
    t.setValue(String(revertTo));
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
      .setDesc("「新增個股筆記」指令的預設存放位置")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.stocksFolder)
          .onChange(async (v) => {
            this.plugin.settings.stocksFolder = v.trim() || DEFAULT_SETTINGS.stocksFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("題材筆記資料夾")
      .setDesc("「新增題材筆記」指令的預設存放位置")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.themeFolder)
          .onChange(async (v) => {
            this.plugin.settings.themeFolder = v.trim() || DEFAULT_SETTINGS.themeFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("總經筆記資料夾")
      .setDesc("「新增總經筆記」指令的預設存放位置")
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
            } else {
              this.rejectInvalidNumber(t, "報價快取時間", this.plugin.settings.cacheTtlMinutes);
            }
          })
      );

    new Setting(containerEl).setName("自選股").setHeading();

    new Setting(containerEl)
      .setName("自選股清單")
      .setDesc("逗號分隔，例如：2330, 3661, 0050（上櫃請加 .TWO，例如 6488.TWO）。持倉股票會自動顯示，不需重複填。")
      .addTextArea((t) =>
        t
          .setValue(this.plugin.settings.watchlist.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.watchlist = v
              .split(/[,，\s]+/)
              .map((s) => normalizeTicker(s))
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
          } else {
            this.rejectInvalidNumber(t, "手續費率", this.plugin.settings.feeRate);
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
            } else {
              this.rejectInvalidNumber(t, "手續費折扣", this.plugin.settings.feeDiscount);
            }
          })
      );

    new Setting(containerEl)
      .setName("整股最低手續費（元）")
      .setDesc("股數為 1000 股整數倍時套用，預設 20 元")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.minFee)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.minFee = n;
            await this.plugin.saveSettings();
          } else {
            this.rejectInvalidNumber(t, "整股最低手續費", this.plugin.settings.minFee);
          }
        })
      );

    new Setting(containerEl)
      .setName("零股最低手續費（元）")
      .setDesc("股數非 1000 股整數倍時套用；依券商而異，多數電子下單為 1 元，請以對帳單為準")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.oddLotMinFee))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n >= 0) {
              this.plugin.settings.oddLotMinFee = n;
              await this.plugin.saveSettings();
            } else {
              this.rejectInvalidNumber(t, "零股最低手續費", this.plugin.settings.oddLotMinFee);
            }
          })
      );

    new Setting(containerEl)
      .setName("證交稅率")
      .setDesc(
        "一般股票 0.003（新增交易 Modal 的「證交稅別」下拉會以此為「一般股票」選項的稅率；" +
          "ETF、債券ETF 兩個選項固定 0.001／0，不受此設定影響）"
      )
      .addText((t) =>
        t.setValue(String(this.plugin.settings.taxRate)).onChange(async (v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0) {
            this.plugin.settings.taxRate = n;
            await this.plugin.saveSettings();
          } else {
            this.rejectInvalidNumber(t, "證交稅率", this.plugin.settings.taxRate);
          }
        })
      );
  }
}
