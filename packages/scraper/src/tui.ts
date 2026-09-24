#!/usr/bin/env npx tsx
// Interactive terminal dashboard for the scraper.
// Run with: pnpm --filter @kmodern/scraper tui

import { emitKeypressEvents, type Key } from "node:readline";
import {
  runPipeline,
  type PipelineEvent,
  type PipelineResult,
} from "./pipeline";
import { SOURCES } from "./sources";

const ESC = "\u001b";
const ENTER_SCREEN = `${ESC}[?1049h${ESC}[?25l`;
const LEAVE_SCREEN = `${ESC}[?25h${ESC}[?1049l`;
const CLEAR_SCREEN = `${ESC}[H${ESC}[2J`;

const COLORS = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  cyan: `${ESC}[36m`,
} as const;

type Screen = "setup" | "running" | "result";
type SetupField = "source" | "limit" | "cache" | "images";
type RunPhase =
  | "discovering"
  | "scrolling"
  | "scraping"
  | "refining"
  | "downloading"
  | "writing"
  | "done"
  | "cancelling"
  | "cancelled"
  | "error";

interface Settings {
  source: string;
  limit: string;
  cache: boolean;
  downloadImages: boolean;
}

interface RunState {
  phase: RunPhase;
  source: string;
  discovered: number;
  current: number;
  total: number;
  records: number;
  currentUrl: string;
  currentName: string;
  imagesDownloaded: number;
  imagesTotal: number;
  imageErrors: number;
  startedAt: number;
  activity: string[];
  result?: PipelineResult;
  error?: string;
}

const SOURCE_IDS = ["all", ...Object.keys(SOURCES)];

function fit(value: string, width: number): string {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (width <= 0) return "";
  if (clean.length <= width) return clean.padEnd(width);
  return `${clean.slice(0, Math.max(0, width - 1))}…`;
}

function box(title: string, lines: string[], width: number): string[] {
  const contentWidth = Math.max(12, width - 4);
  const topFill = Math.max(0, contentWidth - title.length - 1);
  const top = `┌─ ${title} ${"─".repeat(topFill)}┐`;
  const bottom = `└${"─".repeat(contentWidth + 2)}┘`;
  return [
    top,
    ...lines.map((line) => `│ ${fit(line, contentWidth)} │`),
    bottom,
  ];
}

function width(): number {
  return Math.max(56, process.stdout.columns ?? 100);
}

function elapsedSince(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function progressBar(current: number, total: number, length = 28): string {
  if (!total) return `${"·".repeat(length)}  waiting`;
  const complete = Math.max(0, Math.min(length, Math.round((current / total) * length)));
  return `${"█".repeat(complete)}${"░".repeat(length - complete)}  ${current}/${total}`;
}

function shortUrl(value: string): string {
  if (!value) return "—";
  try {
    const path = decodeURIComponent(new URL(value).pathname);
    return path.length > 72 ? `…${path.slice(-71)}` : path;
  } catch {
    return value.length > 72 ? `…${value.slice(-71)}` : value;
  }
}

function parseLimit(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function defaultSettings(): Settings {
  return {
    source: SOURCE_IDS[0] ?? "all",
    limit: "",
    cache: true,
    downloadImages: true,
  };
}

function newRunState(settings: Settings): RunState {
  return {
    phase: "discovering",
    source: settings.source,
    discovered: 0,
    current: 0,
    total: 0,
    records: 0,
    currentUrl: "",
    currentName: "",
    imagesDownloaded: 0,
    imagesTotal: 0,
    imageErrors: 0,
    startedAt: Date.now(),
    activity: [],
  };
}

class ScraperTui {
  private settings = defaultSettings();
  private screen: Screen = "setup";
  private focus: SetupField = "source";
  private state?: RunState;
  private controller?: AbortController;
  private exitAfterCancel = false;
  private exitCode = 0;
  private cleanedUp = false;
  private resolve?: () => void;

  private readonly onKeypress = (_chunk: string, key: Key): void => {
    this.handleKey(key);
  };

  private readonly onResize = (): void => {
    this.render();
  };

  private readonly onSignal = (): void => {
    if (this.screen === "running") this.cancel(130);
    else this.quit(130);
  };

  start(): Promise<void> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error(
        "The TUI needs an interactive terminal. Use `pnpm --filter @kmodern/scraper scrape` for CI or pipes.",
      );
    }

    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(ENTER_SCREEN);
    process.stdin.on("keypress", this.onKeypress);
    process.stdout.on("resize", this.onResize);
    process.once("SIGINT", this.onSignal);
    process.once("SIGTERM", this.onSignal);
    this.render();

    return new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }

  private handleKey(key: Key): void {
    if (key.ctrl && key.name === "c") {
      if (this.screen === "running") this.cancel(130);
      else this.quit(130);
      return;
    }

    if (this.screen === "running") {
      if (key.name === "q" || key.name === "escape") this.cancel(0);
      return;
    }

    if (this.screen === "result") {
      if (key.name === "r") {
        this.screen = "setup";
        this.state = undefined;
        this.focus = "source";
        this.render();
      } else if (key.name === "q" || key.name === "escape") {
        this.quit(0);
      }
      return;
    }

    this.handleSetupKey(key);
  }

  private handleSetupKey(key: Key): void {
    const fields: SetupField[] = ["source", "limit", "cache", "images"];
    const currentIndex = fields.indexOf(this.focus);

    switch (key.name) {
      case "up":
        this.focus = fields[(currentIndex - 1 + fields.length) % fields.length];
        this.render();
        return;
      case "down":
        this.focus = fields[(currentIndex + 1) % fields.length];
        this.render();
        return;
      case "left":
        if (this.focus === "source") this.cycleSource(-1);
        return;
      case "right":
        if (this.focus === "source") this.cycleSource(1);
        return;
      case "space":
        if (this.focus === "cache") {
          this.settings.cache = !this.settings.cache;
          this.render();
        } else if (this.focus === "images") {
          this.settings.downloadImages = !this.settings.downloadImages;
          this.render();
        }
        return;
      case "backspace":
        if (this.focus === "limit" && this.settings.limit) {
          this.settings.limit = this.settings.limit.slice(0, -1);
          this.render();
        }
        return;
      case "return":
      case "enter":
        this.startRun();
        return;
      case "q":
      case "escape":
        this.quit(0);
        return;
      default:
        break;
    }

    if (this.focus === "limit" && key.sequence && /^\d$/.test(key.sequence)) {
      this.settings.limit += key.sequence;
      this.render();
    }
  }

  private cycleSource(direction: -1 | 1): void {
    const index = Math.max(0, SOURCE_IDS.indexOf(this.settings.source));
    const next = (index + direction + SOURCE_IDS.length) % SOURCE_IDS.length;
    this.settings.source = SOURCE_IDS[next] ?? "all";
    this.render();
  }

  private startRun(): void {
    if (this.screen === "running") return;
    this.screen = "running";
    this.state = newRunState(this.settings);
    this.controller = new AbortController();
    this.exitAfterCancel = false;
    this.exitCode = 0;
    this.render();

    const settings = { ...this.settings };
    const controller = this.controller;
    void (async () => {
      const state = this.state!;
      try {
        const result = await runPipeline({
          sources: settings.source === "all" ? undefined : [settings.source],
          limit: parseLimit(settings.limit),
          quiet: true,
          signal: controller.signal,
          fetchOpts: {
            cacheDir: settings.cache ? ".scrape-cache" : undefined,
          },
          downloadImages: settings.downloadImages,
          onProgress: (event) => this.handleProgress(state, event),
        });

        if (controller.signal.aborted) {
          state.phase = "cancelled";
          state.activity.push("Cancelled; no output was written.");
        } else {
          state.result = result;
          state.imagesDownloaded = result.imagesDownloaded;
          state.imagesTotal = result.imagesTotal;
          state.imageErrors = result.imageErrors.length;
          state.phase = "done";
          state.activity.push(
            `Completed with ${result.errors.length} page error(s) and ${result.imageErrors.length} image error(s).`,
          );
        }
      } catch (error) {
        if (controller.signal.aborted) {
          state.phase = "cancelled";
          state.activity.push("Cancelled.");
        } else {
          state.phase = "error";
          state.error = error instanceof Error ? error.message : String(error);
          state.activity.push(`Failed: ${state.error}`);
        }
      } finally {
        this.controller = undefined;
        if (this.exitAfterCancel) {
          this.cleanup();
        } else {
          this.screen = "result";
          this.render();
        }
      }
    })();
  }

  private handleProgress(state: RunState, event: PipelineEvent): void {
    switch (event.type) {
      case "source-start":
        state.source = event.sourceId;
        state.phase = "discovering";
        state.discovered = 0;
        state.current = 0;
        state.total = 0;
        state.activity.unshift(`Starting ${event.brand} (${event.sourceId})…`);
        break;
      case "listing-complete":
        state.phase = "scrolling";
        state.discovered = event.count;
        state.total = event.count;
        state.current = 0;
        state.activity.unshift(`Found ${event.count} product page(s).`);
        break;
      case "product-start":
        state.phase = "scraping";
        state.current = event.index;
        state.total = event.total;
        state.currentUrl = event.url;
        state.currentName = "";
        break;
      case "product-complete":
        state.records += 1;
        state.currentName = event.name;
        state.activity.unshift(`✓ ${event.name}`);
        break;
      case "product-error":
        state.activity.unshift(`✗ ${shortUrl(event.url)}: ${event.message}`);
        break;
      case "refine-start":
        state.phase = "refining";
        state.activity.unshift(`Refining ${event.records} raw record(s)…`);
        break;
      case "refine-complete":
        state.phase = "writing";
        state.activity.unshift(
          `Merged ${event.merged} duplicate(s); ${event.conflicts} conflict(s).`,
        );
        break;
      case "image-start":
        state.phase = "downloading";
        state.current = 0;
        state.total = event.total;
        state.imagesDownloaded = 0;
        state.imagesTotal = event.total;
        state.activity.unshift(`Downloading ${event.total} product image(s)…`);
        break;
      case "image-complete":
        state.current = event.current;
        state.total = event.total;
        state.imagesDownloaded = event.downloaded ?? event.current;
        state.imagesTotal = event.total;
        if (event.current === event.total) state.activity.unshift(`Processed ${event.total}; downloaded ${event.downloaded ?? event.current} product image(s).`);
        break;
      case "image-error":
        state.imageErrors += 1;
        state.activity.unshift(`✗ image ${shortUrl(event.url)}: ${event.message}`);
        break;
      case "price-list-start":
        state.activity.unshift(`Price list: ${event.fileName}…`);
        break;
      case "price-list-complete":
        state.activity.unshift(`Price list: ${event.matched} matched, ${event.unmatched} unmatched, ${event.ambiguous} ambiguous.`);
        break;
    }
    state.activity = state.activity.slice(0, 8);
    this.render();
  }

  private cancel(code: number): void {
    if (this.screen !== "running") {
      this.quit(code);
      return;
    }
    this.exitAfterCancel = true;
    this.exitCode = code;
    this.controller?.abort();
    if (this.state) {
      this.state.phase = "cancelling";
      this.state.activity.unshift("Cancellation requested…");
      this.render();
    }
  }

  private quit(code: number): void {
    this.exitCode = code;
    if (this.screen === "running") {
      this.cancel(code);
      return;
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    process.stdin.off("keypress", this.onKeypress);
    process.stdout.off("resize", this.onResize);
    process.off("SIGINT", this.onSignal);
    process.off("SIGTERM", this.onSignal);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(LEAVE_SCREEN);
    process.exitCode = this.exitCode;
    this.resolve?.();
  }

  private render(): void {
    if (this.cleanedUp) return;
    const terminalWidth = width();
    let title: string;
    let body: string[];
    let footer: string;

    if (this.screen === "setup") {
      title = "CONFIGURE";
      body = this.setupBody(terminalWidth);
      footer = "↑/↓ field   ←/→ source   Space toggle   Enter start   q quit";
    } else if (this.screen === "running") {
      title = "SCRAPING";
      body = this.runningBody(terminalWidth);
      footer = "q / Esc cancel   Ctrl+C cancel";
    } else {
      title = "RESULT";
      body = this.resultBody(terminalWidth);
      footer = "r run again   q quit";
    }

    const lines = [
      `${COLORS.bold}${COLORS.cyan}Kmodern / Scraper${COLORS.reset}  ${COLORS.dim}${title}${COLORS.reset}`,
      `${COLORS.dim}${"─".repeat(terminalWidth)}${COLORS.reset}`,
      ...body,
      "",
      `${COLORS.dim}${fit(footer, terminalWidth)}${COLORS.reset}`,
    ];
    const maxHeight = Math.max(12, process.stdout.rows ?? 24);
    process.stdout.write(
      `${CLEAR_SCREEN}${lines.slice(0, maxHeight).join("\n")}`,
    );
  }

  private setupBody(terminalWidth: number): string[] {
    const source = this.settings.source === "all" ? "all adapters" : this.settings.source;
    const limit = this.settings.limit.trim() || "all products";
    const cache = this.settings.cache ? "on" : "off";
    const images = this.settings.downloadImages ? "on" : "off";
    const marker = (field: SetupField) => (this.focus === field ? "›" : " ");
    return [
      ...box(
        "Run",
        [
          `${marker("source")} Source     ${source}`,
          `${marker("limit")} Limit      ${limit}`,
          `${marker("cache")} Disk cache ${cache}`,
          `${marker("images")} Images     ${images}`,
        ],
        terminalWidth,
      ),
      "",
      ...box(
        "Notes",
        [
          "The cache makes repeated runs fast and keeps requests polite.",
          "Blank limit crawls every discovered product.",
          "Images are stored under packages/scraper/out/images.",
          "Existing CLI mode remains available for automation.",
        ],
        terminalWidth,
      ),
    ];
  }

  private runningBody(terminalWidth: number): string[] {
    const state = this.state;
    if (!state) return ["Preparing…"];
    const phase: Record<RunPhase, string> = {
      discovering: "Discovering product pages",
      scrolling: "Listing ready",
      scraping: "Scraping product pages",
      refining: "Refining Persian text",
      downloading: "Downloading product images",
      writing: "Writing catalog fragment",
      done: "Complete",
      cancelling: "Cancelling",
      cancelled: "Cancelled",
      error: "Error",
    };
    return [
      ...box(
        "Run",
        [
          `Status    ${phase[state.phase]}`,
          `Source    ${state.source}`,
          `Elapsed   ${elapsedSince(state.startedAt)}`,
          `Discovered ${state.discovered}`,
          `Records   ${state.records}`,
          `Images    ${state.imagesDownloaded}/${state.imagesTotal}`,
          `Progress  ${progressBar(state.current, state.total)}`,
          `Current   ${shortUrl(state.currentUrl)}`,
          `Product   ${state.currentName || "—"}`,
        ],
        terminalWidth,
      ),
      "",
      ...box(
        "Activity",
        state.activity.length ? state.activity : ["Waiting for adapter…"],
        terminalWidth,
      ),
    ];
  }

  private resultBody(terminalWidth: number): string[] {
    const state = this.state;
    if (!state) return ["No run available."];
    if (state.phase === "cancelled") {
      return box("Cancelled", ["The run was stopped before a complete catalog was written."], terminalWidth);
    }
    if (state.phase === "error") {
      return box("Error", [state.error ?? "Unknown error"], terminalWidth);
    }

    const result = state.result;
    if (!result) return box("Result", ["No result available."], terminalWidth);
    const report = result.report;
    return [
      ...box(
        "Summary",
        [
          `Kept       ${result.products.length} output product(s)`,
          `Merged     ${report.merged} duplicate(s)`,
          `Conflicts  ${report.conflicts.length}`,
           `Images     ${result.imagesDownloaded}/${result.imagesTotal}`,
           `Image errors ${result.imageErrors.length}`,
          `Errors     ${result.errors.length}`,
          `Filtered   ${result.filteredOut}`,
           `Output     ${result.outDir}`,
        ],
        terminalWidth,
      ),
      "",
      ...box(
        "Products",
        result.products.length
          ? result.products.slice(0, 6).map((product) => `${product.name}  [${product.slug}]`)
          : ["No products were produced."],
        terminalWidth,
      ),
    ];
  }
}

async function main(): Promise<void> {
  const tui = new ScraperTui();
  await tui.start();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
