import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  runPipeline,
  SOURCES,
  type PipelineEvent,
  type PipelineResult,
} from "@kmodern/scraper";
import type {
  ScraperCatalogItem,
  ScraperJobOptions,
  ScraperJobPhase,
  ScraperJobSnapshot,
  ScraperJobStatus,
} from "@/lib/scraper-types";

export type { ScraperCatalogItem, ScraperJobOptions, ScraperJobPhase, ScraperJobSnapshot, ScraperJobStatus } from "@/lib/scraper-types";

interface InternalJob {
  controller: AbortController;
  snapshot: ScraperJobSnapshot;
}

const OUTPUT_FILES = new Set(["raw-scrape.json", "catalog.fragment.json", "merge-report.json"]);
const MAX_LIMIT = 500;

function scraperPackageDir(): string {
  if (process.env.SCRAPER_PACKAGE_DIR) return resolve(process.env.SCRAPER_PACKAGE_DIR);
  const cwd = resolve(/* turbopackIgnore: true */ process.cwd());
  return cwd.endsWith(`${sep}apps${sep}admin`)
    ? resolve(cwd, "../..", "packages", "scraper")
    : resolve(cwd, "packages", "scraper");
}

function emptySnapshot(): ScraperJobSnapshot {
  return {
    id: "",
    status: "idle",
    phase: "idle",
    source: "all",
    limit: null,
    cache: true,
    startedAt: null,
    finishedAt: null,
    current: 0,
    total: 0,
    records: 0,
    kept: 0,
    merged: 0,
    conflicts: 0,
    errors: 0,
    outputDir: null,
    error: null,
    activity: [],
  };
}

function isActive(status: ScraperJobStatus): boolean {
  return status === "running" || status === "cancelling";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class ScraperJobManager {
  private current?: InternalJob;

  get(): ScraperJobSnapshot {
    if (!this.current) return emptySnapshot();
    return { ...this.current.snapshot, activity: [...this.current.snapshot.activity] };
  }

  start(options: ScraperJobOptions): ScraperJobSnapshot {
    if (this.current && isActive(this.current.snapshot.status)) {
      throw new Error("SCRAPE_IN_PROGRESS");
    }
    if (options.source !== "all" && !(options.source in SOURCES)) {
      throw new Error("UNKNOWN_SOURCE");
    }
    if (
      options.limit !== undefined &&
      (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_LIMIT)
    ) {
      throw new Error("INVALID_LIMIT");
    }

    const job: InternalJob = {
      controller: new AbortController(),
      snapshot: {
        ...emptySnapshot(),
        id: randomUUID(),
        status: "running",
        phase: "discovering",
        source: options.source,
        limit: options.limit ?? null,
        cache: options.cache,
        startedAt: new Date().toISOString(),
        activity: [`Starting ${options.source === "all" ? "all adapters" : options.source}…`],
      },
    };
    this.current = job;

    void runPipeline({
      sources: options.source === "all" ? undefined : [options.source],
      limit: options.limit,
      quiet: true,
      signal: job.controller.signal,
      outDir: join(scraperPackageDir(), "out"),
      fetchOpts: {
        cacheDir: options.cache ? join(scraperPackageDir(), ".scrape-cache") : undefined,
      },
      onProgress: (event) => this.onProgress(job, event),
    })
      .then((result) => this.complete(job, result))
      .catch((error) => this.fail(job, error));

    return this.get();
  }

  cancel(): ScraperJobSnapshot {
    if (!this.current || !isActive(this.current.snapshot.status)) return this.get();
    this.current.controller.abort();
    this.current.snapshot.status = "cancelling";
    this.addActivity(this.current.snapshot, "Cancellation requested…");
    return this.get();
  }

  async readOutput(filename: string): Promise<{ body: Buffer; filename: string } | null> {
    const outputDir = this.current?.snapshot.outputDir ?? join(scraperPackageDir(), "out");
    if (!OUTPUT_FILES.has(filename)) return null;
    const body = await readFile(join(outputDir, filename));
    return { body, filename };
  }

  async getCatalog(): Promise<ScraperCatalogItem[]> {
    const file = await this.readOutput("catalog.fragment.json").catch(() => null);
    if (!file) return [];
    try {
      const parsed: unknown = JSON.parse(file.body.toString("utf8"));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is ScraperCatalogItem => {
        if (!item || typeof item !== "object") return false;
        const value = item as Record<string, unknown>;
        return typeof value.slug === "string" &&
          typeof value.name === "string" &&
          typeof value.brand === "string" &&
          Array.isArray(value.colors) &&
          Array.isArray(value.image) &&
          Array.isArray(value.features) &&
          Array.isArray(value.specs);
      });
    } catch {
      return [];
    }
  }

  private onProgress(job: InternalJob, event: PipelineEvent): void {
    const state = job.snapshot;
    switch (event.type) {
      case "source-start":
        state.source = event.sourceId;
        state.phase = "discovering";
        state.current = 0;
        state.total = 0;
        this.addActivity(state, `Starting ${event.brand} (${event.sourceId})…`);
        break;
      case "listing-complete":
        state.phase = "scraping";
        state.current = 0;
        state.total = event.count;
        this.addActivity(state, `Found ${event.count} product page(s).`);
        break;
      case "product-start":
        state.phase = "scraping";
        state.current = event.index;
        state.total = event.total;
        break;
      case "product-complete":
        state.records += 1;
        this.addActivity(state, `✓ ${event.name}`);
        break;
      case "product-error":
        state.errors += 1;
        this.addActivity(state, `✗ ${event.url}: ${event.message}`);
        break;
      case "refine-start":
        state.phase = "refining";
        this.addActivity(state, `Refining ${event.records} raw record(s)…`);
        break;
      case "refine-complete":
        state.phase = "writing";
        state.kept = event.kept;
        state.merged = event.merged;
        state.conflicts = event.conflicts;
        this.addActivity(state, `Merged ${event.merged} duplicate(s); ${event.conflicts} conflict(s).`);
        break;
    }
  }

  private complete(job: InternalJob, result: PipelineResult): void {
    if (this.current !== job) return;
    job.snapshot.status = "completed";
    job.snapshot.phase = "complete";
    job.snapshot.finishedAt = new Date().toISOString();
    job.snapshot.kept = result.report.kept;
    job.snapshot.merged = result.report.merged;
    job.snapshot.conflicts = result.report.conflicts.length;
    job.snapshot.errors = result.errors.length;
    job.snapshot.outputDir = result.outDir;
    this.addActivity(job.snapshot, `Completed with ${result.errors.length} page error(s).`);
  }

  private fail(job: InternalJob, error: unknown): void {
    if (this.current !== job) return;
    const cancelled = job.controller.signal.aborted;
    job.snapshot.status = cancelled ? "cancelled" : "failed";
    job.snapshot.phase = "idle";
    job.snapshot.finishedAt = new Date().toISOString();
    job.snapshot.error = cancelled ? null : errorMessage(error);
    this.addActivity(job.snapshot, cancelled ? "Cancelled." : `Failed: ${job.snapshot.error}`);
  }

  private addActivity(state: ScraperJobSnapshot, message: string): void {
    state.activity = [message, ...state.activity].slice(0, 12);
  }
}

const globalForScraper = globalThis as typeof globalThis & {
  __kmodernScraperJobs?: ScraperJobManager;
};

const existingJobs = globalForScraper.__kmodernScraperJobs;
export const scraperJobs =
  existingJobs && typeof existingJobs.getCatalog === "function"
    ? existingJobs
    : (globalForScraper.__kmodernScraperJobs = new ScraperJobManager());
