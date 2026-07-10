import { Plugin, requestUrl, type WorkspaceLeaf } from "obsidian";
import { DASHBOARD_VIEW_TYPE, DashboardView } from "./dashboard/view";
import { registerKlineProcessor } from "./kline/processor";
import {
  NewMacroNoteModal,
  NewStockNoteModal,
  NewTradeModal,
} from "./commands/scaffold";
import {
  DEFAULT_SETTINGS,
  InvRecordSettingTab,
  type InvRecordSettings,
} from "./settings";
import { TradeStore } from "./trades/store";
import { YahooClient } from "./yahoo/client";

export default class InvRecordPlugin extends Plugin {
  settings: InvRecordSettings = DEFAULT_SETTINGS;
  yahoo!: YahooClient;
  tradeStore!: TradeStore;

  async onload(): Promise<void> {
    await this.loadSettings();

    // requestUrl 由 Obsidian 提供，原生繞過 CORS
    this.yahoo = new YahooClient(async (url: string) => {
      const res = await requestUrl({
        url,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      return res.json;
    }, this.settings.cacheTtlMinutes * 60_000);

    this.tradeStore = new TradeStore(this.app, this);
    this.addChild(this.tradeStore);

    registerKlineProcessor(this);

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
