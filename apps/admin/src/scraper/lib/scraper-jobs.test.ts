// The live product list, driven through the job manager's own progress hook.
//
// The gap this covers is the one an operator watching a run felt: the review list is written to
// `catalog.fragment.json` at the very end, so until the run finished there was nothing on screen but
// counters. These assertions are about the accumulation itself — what the list keeps, in what order,
// and when it is thrown away — because that is the behaviour, not the plumbing that produces it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineEvent, PipelineOptions, PipelineResult } from "@kmodern/scraper-core";
import type * as ScraperCore from "@kmodern/scraper-core";
import { scraperJobs } from "@/scraper/lib/scraper-jobs";

const { runPipelineMock } = vi.hoisted(() => ({ runPipelineMock: vi.fn() }));

// Everything else from the package is real; only the crawl is replaced, so `SOURCES`, the source
// validation and the price-list plumbing stay the ones the panel actually ships.
vi.mock("@kmodern/scraper-core", async (importOriginal) => {
  const actual = await importOriginal<typeof ScraperCore>();
  return { ...actual, runPipeline: (options: PipelineOptions) => runPipelineMock(options) };
});


const RESULT: PipelineResult = {
  products: [],
  report: { kept: 0, merged: 0, conflicts: [] },
  errors: [],
  imageErrors: [],
  imagesDownloaded: 0,
  imagesTotal: 0,
  filteredOut: 0,
  outDir: "/tmp/scraper-out",
};

let emit: (event: PipelineEvent) => void = () => {};
let finish: () => void = () => {};

beforeEach(() => {
  runPipelineMock.mockReset();
  runPipelineMock.mockImplementation((options: PipelineOptions) => {
    const run = Promise.withResolvers<PipelineResult>();
    emit = options.onProgress ?? (() => {});
    finish = () => run.resolve(RESULT);
    return run.promise;
  });
});

// A test that leaves a run in flight blocks the next one's `start()`, so every run is closed here
// rather than each test remembering to.
afterEach(async () => {
  finish();
  await vi.waitFor(() => expect(scraperJobs.get().status).not.toBe("running"));
});

function start(): string {
  return scraperJobs.start({ source: "all", cache: false, downloadImages: false, priceLookup: false }).id;
}

function scraped(index: number, overrides: Partial<Extract<PipelineEvent, { type: "product-complete" }>> = {}): PipelineEvent {
  return {
    type: "product-complete",
    sourceId: "datees",
    index,
    total: 400,
    name: `محصول ${index}`,
    brand: "داتیس",
    price: index * 1000,
    colors: ["black", "steel"],
    image: `https://cdn.datees.ir/p${index}.jpg`,
    ...overrides,
  };
}

describe("the live product list of a job", () => {
  it("reports an idle manager as an empty view rather than a stale run", () => {
    expect(scraperJobs.getLive()).toEqual({ jobId: "", status: "idle", items: [] });
  });

  it("holds the most recent rows, newest first, and caps what it keeps", () => {
    start();
    for (let index = 1; index <= 305; index += 1) emit(scraped(index));

    const live = scraperJobs.getLive();
    expect(live.items).toHaveLength(300);
    expect(live.items[0]?.name).toBe("محصول 305");
    expect(live.items[299]?.name).toBe("محصول 6");
    // The price and colour count are what the row is for; a manufacturer page without a price has to
    // stay visibly "no price" rather than fall back to zero.
    expect(live.items[0]?.price).toBe(305000);
    expect(live.items[0]?.colors).toEqual(["black", "steel"]);
  });

  it("carries the fields the row renders, and no slug it cannot have", () => {
    start();
    emit(scraped(1, { price: null, image: null, colors: [] }));

    expect(scraperJobs.getLive().items[0]).toEqual({
      sourceId: "datees",
      index: 1,
      name: "محصول 1",
      brand: "داتیس",
      price: null,
      colors: [],
      image: null,
      url: null,
    });
  });

  it("links a row to the page it was read from", () => {
    start();
    emit({ type: "product-start", sourceId: "datees", index: 1, total: 400, url: "https://datees.ir/product/one" });
    emit(scraped(1));

    expect(scraperJobs.getLive().items[0]?.url).toBe("https://datees.ir/product/one");
  });

  it("starts the next run empty, under its own job id", async () => {
    const firstJobId = start();
    emit(scraped(1));
    emit(scraped(2));
    finish();

    await vi.waitFor(() => expect(scraperJobs.get().status).toBe("completed"));
    const secondJobId = start();
    expect(secondJobId).not.toBe(firstJobId);

    const live = scraperJobs.getLive();
    expect(live.jobId).toBe(secondJobId);
    expect(live.items).toEqual([]);

    emit(scraped(7));
    expect(scraperJobs.getLive().items.map((item) => item.name)).toEqual(["محصول 7"]);
  });
});
