import {
  Component,
  TAbstractFile,
  TFile,
  type App,
  type EventRef,
  type FrontmatterLinkCache,
} from "obsidian";
import type InvRecordPlugin from "../main";
import type { FifoResult, ParseIssue, TradeRecord } from "../types";
import { computeFifo } from "./fifo";
import { checkStockLinkConsistency } from "./noteLinks";
import { parseTradeFrontmatter } from "./parser";

/**
 * 掃描交易資料夾的 frontmatter（走 metadataCache，不讀檔案內容），
 * 監聽變更後 debounce 重算 FIFO，並通知訂閱者（儀表板）。
 */
export class TradeStore extends Component {
  trades: TradeRecord[] = [];
  parseIssues: ParseIssue[] = [];
  fifo: FifoResult = computeFifo([]);

  private listeners = new Set<() => void>();
  private debounceTimer: number | null = null;

  constructor(
    private app: App,
    private plugin: InvRecordPlugin
  ) {
    super();
  }

  onload(): void {
    // metadataCache 啟動時可能尚未就緒；resolved 事件後再掃一次
    this.registerEvent(
      this.app.metadataCache.on("resolved", () => this.scheduleRescan())
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.isRelevant(file)) this.scheduleRescan();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.isRelevant(file)) this.scheduleRescan();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.isRelevant(file) || this.isRelevantPath(oldPath)) {
          this.scheduleRescan();
        }
      })
    );
    this.rescan();
  }

  onunload(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.listeners.clear();
  }

  /** 訂閱資料變更；回傳取消訂閱函式 */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private isRelevantPath(path: string): boolean {
    const folder = this.plugin.settings.tradesFolder;
    return path === folder || path.startsWith(`${folder}/`);
  }

  private isRelevant(file: TAbstractFile): boolean {
    return this.isRelevantPath(file.path);
  }

  private scheduleRescan(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.rescan();
    }, 500);
  }

  rescan(): void {
    const trades: TradeRecord[] = [];
    const issues: ParseIssue[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isRelevantPath(file.path)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const result = parseTradeFrontmatter(
        cache?.frontmatter as Record<string, unknown> | undefined,
        file.path
      );
      if (result.trade) {
        trades.push(result.trade);
        const linkIssue = this.checkStockLink(file, result.trade, cache?.frontmatterLinks);
        if (linkIssue) issues.push(linkIssue);
      }
      issues.push(...result.issues);
    }
    this.trades = trades;
    this.parseIssues = issues;
    this.fifo = computeFifo(trades);
    for (const fn of this.listeners) fn();
  }

  /**
   * 唯讀一致性檢查：交易的 stock: 連結若能解析到個股筆記，
   * 且該筆記 frontmatter.ticker 與本筆交易 ticker 不一致，回報一條 issue。
   * 不修改任何筆記，只是把「隱性漂移」變「可見警告」（見鏈結決策備忘）。
   */
  private checkStockLink(
    file: TFile,
    trade: TradeRecord,
    frontmatterLinks: FrontmatterLinkCache[] | undefined
  ): ParseIssue | null {
    const stockLink = frontmatterLinks?.find((l) => l.key === "stock");
    if (!stockLink) return null;
    const target = this.app.metadataCache.getFirstLinkpathDest(
      stockLink.link,
      file.path
    );
    if (!target) return null; // 連結解析不到筆記（尚未建立），不在此檢查範圍
    const targetFrontmatter = this.app.metadataCache.getFileCache(target)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const rawTicker = targetFrontmatter?.ticker;
    if (rawTicker === undefined || rawTicker === null) return null;
    return checkStockLinkConsistency(
      file.path,
      trade.ticker,
      String(rawTicker),
      target.path
    );
  }

  /** 持倉 + 自選股的所有代號（報價用） */
  tickersToQuote(): string[] {
    const set = new Set<string>(this.fifo.openLots.keys());
    for (const t of this.plugin.settings.watchlist) set.add(t);
    return [...set];
  }
}
