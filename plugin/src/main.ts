import { Plugin, requestUrl, type WorkspaceLeaf } from "obsidian";
import { registerChartProcessor } from "./charts/processor";
import { DASHBOARD_VIEW_TYPE, DashboardView } from "./dashboard/view";
import { registerKlineProcessor } from "./kline/processor";
import {
  NewMacroNoteModal,
  NewStockNoteModal,
  NewThemeNoteModal,
  NewTradeModal,
} from "./commands/scaffold";
import {
  DEFAULT_SETTINGS,
  InvRecordSettingTab,
  type InvRecordSettings,
} from "./settings";
import { TradeStore } from "./trades/store";
import { describeYahooFetchError, YahooClient } from "./yahoo/client";

export default class InvRecordPlugin extends Plugin {
  settings: InvRecordSettings = DEFAULT_SETTINGS;
  yahoo!: YahooClient;
  tradeStore!: TradeStore;

  async onload(): Promise<void> {
    await this.loadSettings();

    // requestUrl 由 Obsidian 提供，原生繞過 CORS。
    // throw:false + 手動分類錯誤，才能把「查無代號」「連不上網路」分開顯示成
    // 可行動的中文訊息，而不是把 requestUrl 丟出的原始英文例外直接印給使用者看。
    this.yahoo = new YahooClient(async (url: string) => {
      let res;
      try {
        res = await requestUrl({
          url,
          headers: { "User-Agent": "Mozilla/5.0" },
          throw: false,
        });
      } catch {
        throw new Error("無法連上 Yahoo，請檢查網路連線");
      }
      const m = url.match(/chart\/([^?]+)/);
      const symbol = m ? decodeURIComponent(m[1]) : "";
      let body: unknown = null;
      try {
        body = res.json;
      } catch {
        // 回應不是合法 JSON，交由下方當一般錯誤處理
      }
      const errMsg = describeYahooFetchError(res.status, body, symbol);
      if (errMsg) throw new Error(errMsg);
      if (body === null) throw new Error(`無法解析 ${symbol} 的回應內容`);
      return body;
    }, this.settings.cacheTtlMinutes * 60_000);

    this.tradeStore = new TradeStore(this.app, this);
    this.addChild(this.tradeStore);

    registerKlineProcessor(this);
    registerChartProcessor(this);

    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new DashboardView(leaf, this)
    );

    this.addRibbonIcon("line-chart", "開啟績效儀表板", () => {
      void this.activateDashboard();
    });

    this.addCommand({
      id: "open-dashboard",
      name: "開啟績效儀表板",
      callback: () => void this.activateDashboard(),
    });
    this.addCommand({
      id: "new-trade",
      name: "新增交易紀錄",
      callback: () => new NewTradeModal(this.app, this).open(),
    });
    this.addCommand({
      id: "new-stock-note",
      name: "新增個股筆記",
      callback: () => new NewStockNoteModal(this.app, this).open(),
    });
    this.addCommand({
      id: "new-macro-note",
      name: "新增總經筆記",
      callback: () => new NewMacroNoteModal(this.app, this).open(),
    });
    this.addCommand({
      id: "new-theme-note",
      name: "新增題材筆記",
      callback: () => new NewThemeNoteModal(this.app, this).open(),
    });
    this.addCommand({
      id: "refresh-quotes",
      name: "清除快取並更新報價",
      callback: () => {
        this.yahoo.clearCache();
        this.tradeStore.rescan();
      },
    });

    this.addSettingTab(new InvRecordSettingTab(this.app, this));
  }

  onunload(): void {
    // views / events 由 Obsidian 依註冊自動清理
  }

  async activateDashboard(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
      await this.app.workspace.revealLeaf(leaf);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
