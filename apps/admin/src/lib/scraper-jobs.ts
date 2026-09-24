import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  runPipeline,
  SOURCES,
  extractModel,
  makeSlug,
  type PipelineEvent,
  type PipelineResult,
} from "@kmodern/scraper";
import type {
  ScraperCatalogItem,
  ScraperJobOptions,
  ScraperJobPhase,
  ScraperJobSnapshot,
  ScraperJobStatus,
  ScrapeFilters,
} from "@/lib/scraper-types";

export type { ScrapeFilters, ScraperCatalogItem, ScraperJobOptions, ScraperJobPhase, ScraperJobSnapshot, ScraperJobStatus } from "@/lib/scraper-types";

interface InternalJob {
  controller: AbortController;
  snapshot: ScraperJobSnapshot;
}

const OUTPUT_FILES = new Set(["raw-scrape.json", "catalog.fragment.json", "merge-report.json"]);
const MAX_LIMIT = 500;

function isRemoteImage(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function imageContentType(filename: string): string {
  const extension = filename.toLowerCase().split(".").pop();
  return extension === "png" ? "image/png"
    : extension === "webp" ? "image/webp"
      : extension === "avif" ? "image/avif"
        : extension === "gif" ? "image/gif"
          : "image/jpeg";
}

function scraperImageEndpoint(slug: string, index: number): string {
  return `/api/admin/scraper?image=${encodeURIComponent(`${slug}:${index}`)}`;
}

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
    downloadImages: true,
    filters: {},
    startedAt: null,
    finishedAt: null,
    current: 0,
    total: 0,
    records: 0,
    kept: 0,
    merged: 0,
    conflicts: 0,
    errors: 0,
    filteredOut: 0,
    imageErrors: 0,
    imagesDownloaded: 0,
    imagesTotal: 0,
    outputDir: null,
    error: null,
    activity: [],
  };
}

function filterSummary(filters: ScrapeFilters): string | null {
  const active = Object.entries(filters).filter(([, value]) => value && value !== "all");
  return active.length ? active.map(([key, value]) => `${key}=${value}`).join(", ") : null;
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
    return {
      ...emptySnapshot(),
      ...this.current.snapshot,
      filters: this.current.snapshot.filters ?? {},
      activity: [...(this.current.snapshot.activity ?? [])],
    };
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

    const downloadImages = options.downloadImages ?? true;
    const filters: ScrapeFilters = options.filters ?? {};
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
        downloadImages,
        filters,
        startedAt: new Date().toISOString(),
        activity: [
          `Starting ${options.source === "all" ? "all adapters" : options.source}…`,
          ...(filterSummary(filters) ? [`Filters: ${filterSummary(filters)}`] : []),
        ],
      },
    };
    this.current = job;

    void runPipeline({
      sources: options.source === "all" ? undefined : [options.source],
      limit: options.limit,
      quiet: true,
      signal: job.controller.signal,
      outDir: join(scraperPackageDir(), "out"),
      downloadImages,
      imageDir: join(scraperPackageDir(), "out", "images"),
      filters,
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

  async readImage(slug: string, index: number): Promise<{ body: Buffer; filename: string; contentType: string } | null> {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || !Number.isInteger(index) || index < 0 || index > 1000) return null;
    const outputDir = this.current?.snapshot.outputDir ?? join(scraperPackageDir(), "out");
    const imageDir = join(outputDir, "images", slug);
    let filenames: string[];
    try {
      filenames = await readdir(imageDir);
    } catch {
      return null;
    }
    const filename = filenames.find((value) => new RegExp(`^img-${index + 1}\\.(?:jpe?g|png|webp|avif|gif)$`, "i").test(value));
    if (!filename) return null;
    try {
      const body = await readFile(join(imageDir, filename));
      return { body, filename, contentType: imageContentType(filename) };
    } catch {
      return null;
    }
  }

  async getCatalog(options: { publicView?: boolean } = {}): Promise<ScraperCatalogItem[]> {
    const file = await this.readOutput("catalog.fragment.json").catch(() => null);
    if (!file) return [];
    try {
      const parsed: unknown = JSON.parse(file.body.toString("utf8"));
      if (!Array.isArray(parsed)) return [];
      const items = parsed.filter((item): item is ScraperCatalogItem => {
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

      const provenance = new Map<string, { sourceId: string; sourceUrl?: string; sourcePageUrl?: string }>();
      const rawFile = await this.readOutput("raw-scrape.json").catch(() => null);
      if (rawFile) {
        try {
          const raw: unknown = JSON.parse(rawFile.body.toString("utf8"));
          if (Array.isArray(raw)) {
            for (const record of raw) {
              if (!record || typeof record !== "object") continue;
              const value = record as Record<string, unknown>;
              if (typeof value.name !== "string" || typeof value.brand !== "string") continue;
              const specs = Array.isArray(value.specs)
                ? value.specs.filter((spec): spec is { label: string; value: string } =>
                    Boolean(spec && typeof spec === "object" && typeof (spec as { label?: unknown }).label === "string" && typeof (spec as { value?: unknown }).value === "string"),
                )
                : [];
              const slug = makeSlug(value.brand, extractModel(value.name, specs), value.name);
              let sourceUrl: string | undefined;
              if (typeof value.url === "string" && isRemoteImage(value.url)) {
                sourceUrl = new URL(value.url).origin;
              }
              provenance.set(slug, {
                sourceId: typeof value.sourceId === "string" ? value.sourceId : value.brand.toLowerCase(),
                sourceUrl,
                sourcePageUrl: typeof value.url === "string" && isRemoteImage(value.url) ? value.url : undefined,
              });
            }
          }
        } catch {
          // Provenance is optional; the refined fragment remains usable without it.
        }
      }

      const enriched = items.map((item) => {
        const source = provenance.get(item.slug);
        return {
          ...item,
          sourceId: item.sourceId ?? source?.sourceId ?? item.brand.toLowerCase(),
          sourceUrl: item.sourceUrl ?? source?.sourceUrl,
          sourcePageUrl: item.sourcePageUrl ?? source?.sourcePageUrl,
        };
      });

      if (!options.publicView) return enriched;
      return enriched.map((item) => {
        const sourceImages = Array.isArray(item.sourceImages)
          ? item.sourceImages.filter((value): value is string => typeof value === "string" && isRemoteImage(value))
          : [];
        const publicImages = item.image.map((value, index) => {
          if (isRemoteImage(value) || value.startsWith("/products/")) return value;
          return scraperImageEndpoint(item.slug, index);
        });
        return {
          ...item,
          // Never expose scraper filesystem paths to the browser. Local previews
          // use the authenticated image endpoint; imports keep the local paths.
          image: publicImages.length ? publicImages : sourceImages,
          sourceImages: sourceImages.length ? sourceImages : undefined,
        };
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
      case "product-filtered":
        state.filteredOut += 1;
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
      case "image-start":
        state.phase = "downloading";
        state.current = 0;
        state.total = event.total;
        state.imagesDownloaded = 0;
        state.imagesTotal = event.total;
        this.addActivity(state, `Downloading ${event.total} product image(s)…`);
        break;
      case "image-complete":
        state.current = event.current;
        state.total = event.total;
        state.imagesDownloaded = event.downloaded ?? event.current;
        state.imagesTotal = event.total;
        if (event.current === event.total) {
          this.addActivity(state, `Processed ${event.total}; downloaded ${event.downloaded ?? event.current} product image(s).`);
        }
        break;
      case "image-error":
        state.imageErrors += 1;
        this.addActivity(state, `✗ image ${event.url}: ${event.message}`);
        break;
    }
  }

  private complete(job: InternalJob, result: PipelineResult): void {
    if (this.current !== job) return;
    job.snapshot.status = "completed";
    job.snapshot.phase = "complete";
    job.snapshot.finishedAt = new Date().toISOString();
    job.snapshot.kept = result.products.length;
    job.snapshot.merged = result.report.merged;
    job.snapshot.conflicts = result.report.conflicts.length;
    job.snapshot.errors = result.errors.length;
    job.snapshot.filteredOut = result.filteredOut;
    job.snapshot.imageErrors = result.imageErrors.length;
    job.snapshot.imagesDownloaded = result.imagesDownloaded;
    job.snapshot.imagesTotal = result.imagesTotal;
    job.snapshot.outputDir = result.outDir;
    this.addActivity(
      job.snapshot,
      `Completed with ${result.errors.length} page error(s), ${result.filteredOut} filtered record(s), and ${result.imageErrors.length} image error(s).`,
    );
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
