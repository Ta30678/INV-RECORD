# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

INV RECORD is a personal Taiwan-stock investment tracker built as an **Obsidian plugin + vault template**, not a web app. Notes (`.md` files with YAML frontmatter) are the data store; the plugin reads them via Obsidian's `metadataCache`, computes FIFO P&L, and renders candlestick charts. There is no backend/database — `vault-template/` is the shipped, ready-to-open vault, and `plugin/` is its TypeScript source.

Three-layer note structure, linked via frontmatter (`up:` / `stock:` / `theme:`) for Obsidian's Graph View: 總經 (macro) → 題材 (theme) → 個股/交易 (stock/trade).

## Commands

All commands run from `plugin/`:

```bash
npm install
npm test              # vitest run — all unit tests
npm test -- fifo      # run a single test file (vitest filters by filename substring)
npm run build         # tsc -noEmit type check + esbuild production bundle → plugin/main.js
npm run dev           # esbuild watch mode
npm run install:vault # copy plugin/{main.js,manifest.json,styles.css} → vault-template/.obsidian/plugins/inv-record/
npm run check:yahoo   # optional: hits the real Yahoo endpoint (scripts/live-yahoo-check.mjs), not part of CI-style testing
```

**After changing anything in `plugin/src/`, run `npm run build && npm run install:vault` before committing.** Unlike `plugin/main.js` (gitignored), the built copy under `vault-template/.obsidian/plugins/inv-record/` **is committed** — it's what makes the template "open and it just works" per the README. A source change without a rebuilt+reinstalled+committed `vault-template` copy leaves the shipped vault stale.

## Architecture

### Data flow
Trade notes (frontmatter `type: trade`) in the configured trades folder (default `40-交易紀錄/`) are the only notes the plugin actually parses/validates; macro/theme/stock notes are freeform and only used for links and Graph View coloring.

`TradeStore` (`trades/store.ts`, an Obsidian `Component`) scans `vault.getMarkdownFiles()`, reads frontmatter through `metadataCache` (never reads file content directly), debounces rescans (500ms) on `metadataCache.changed`/`vault.delete`/`vault.rename`, and republishes to subscribers (the dashboard view) via a simple pub/sub. `rescan()` → `parseTradeFrontmatter` (validate) → `computeFifo` (P&L) → notify listeners.

### Pure-function core (no `obsidian` import — directly unit-testable in vitest's node environment)
- `trades/parser.ts` — frontmatter → `TradeRecord`; invalid required fields exclude the trade from calculations and produce a `ParseIssue` (surfaced in the dashboard's "資料警告" section) rather than throwing. `time` is the one exception: a bad format is silently dropped (field ignored) without excluding the trade.
- `trades/fifo.ts` — `sortTrades` (order: date → time → seq → buy-before-sell → filePath) + `computeFifo` (FIFO lot consumption, weighted `avgHoldingDays`, oversell only realizes the covered portion and emits an issue — no short selling).
- `trades/portfolio.ts` — position aggregation, realized-P&L summaries, and the three-way return metrics (see below). Also owns the 5 dashboard date-range presets (`resolveDashboardRange`).
- `trades/fees.ts` — Taiwan brokerage fee (0.1425% w/ discount, floored to whole NT$, min NT$20 round-lot / NT$1 odd-lot) and transaction tax (0.3% on sells) estimation, used to prefill the "new trade" modal only.
- `trades/noteLinks.ts` — bidirectional-link helpers. Links are built by **looking up existing notes** (by type + ticker/basename), never by string-guessing a filename, to avoid dangling links. `checkStockLinkConsistency` is read-only: it flags when a trade's `stock:` link resolves to a note whose `ticker` disagrees with the trade's own `ticker`, but never auto-fixes anything.
- `yahoo/parse.ts` — parses the Yahoo `v8/finance/chart` response; `normalizeTicker` is the canonical-ticker function used end-to-end (strips a trailing `.TW`, preserves `.TWO` for OTC/上櫃 tickers) — every layer (frontmatter, FIFO grouping, Yahoo symbol construction) must go through it.
- `kline/blockParams.ts` — parses ` ```kline ` code-block source into `{ ticker, period, range }`.
- `utils/time.ts` — **single source of truth for time**. Everything is Taiwan time (UTC+8). Never hand-roll `new Date().toISOString().slice(0,10)` elsewhere in the codebase — that truncates in UTC and misdates anything created 00:00–07:59 Taiwan time, corrupting FIFO ordering and monthly/yearly P&L bucketing. Use `taiwanToday()` / `taiwanNowString()` / `toTaiwanDateString()` etc.

### Obsidian-integration layer
- `main.ts` — plugin entry point. Wires `YahooClient` with a `fetchJson` closure that wraps `requestUrl` (Obsidian's CORS-free HTTP), classifies failures into Chinese-language messages via `describeYahooFetchError`, and registers commands/views/settings tab.
- `yahoo/client.ts` — `YahooClient` takes `fetchJson` as a constructor-injected function specifically so it stays testable without Obsidian (tests inject a fixture-returning stub). TTL memory cache + in-flight request dedupe + stale-cache fallback on fetch failure. Chart cache and quote cache use different cache keys.
- `kline/processor.ts` / `renderer.ts` — registers the ` ```kline ` markdown code-block processor; renders via `lightweight-charts` v5 (note the v5 API shape: `chart.addSeries(CandlestickSeries, …)`).
- `dashboard/view.ts` — `DashboardView` (`ItemView`), opened via ribbon icon or the "開啟績效儀表板" command. Shows positions, the three-way return breakdown, and per-ticker realized P&L.
- `commands/scaffold.ts` — `Modal` subclasses for creating new trade/stock/macro/theme notes, auto-prefilling fees/tax and wiring `up:`/`stock:`/`theme:` links via `noteLinks.ts` lookups.
- `settings.ts` — settings tab (folders, fee/tax defaults, watchlist, chart defaults, colors).

### Domain invariants worth knowing before changing behavior
- **Three return metrics never mix**: period realized return (realized P&L ÷ realized cost basis, bound to the selected date range), current unrealized return (snapshot, always latest quote, date-range-independent), and since-inception total return (only shown when range = "全部"). See `docs/資料格式.md` for the exact definitions — don't blend these denominators.
- **No annualization anywhere** — short holding periods extrapolated to annual rates produce misleading figures; `avgHoldingDays` (FIFO-consumption-weighted) is used instead.
- Fees/tax are always floored (`Math.floor`) to whole NT dollars to match brokerage statements.
- `docs/資料格式.md` is the authoritative spec for the trade frontmatter schema, FIFO rules, and return definitions — read it before changing validation or calculation logic instead of re-deriving rules from code comments.

## Tests

`plugin/tests/*.test.ts` mirror `src/` structure 1:1 (e.g. `fifo.test.ts` ↔ `src/trades/fifo.ts`); `tests/fixtures/` holds sample Yahoo API responses for `yahooClient.test.ts`/`yahooParse.test.ts`. Tests exercise the pure functions directly — no Obsidian mocking needed for the core logic.
