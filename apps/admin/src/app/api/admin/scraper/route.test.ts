// `GET /api/admin/scraper?view=live`, driven against the real job manager with only the crawl stubbed.
//
// The view exists because the review list is a file written at the end of a run: without it the panel
// had nothing to show an operator until the run finished. The manager under test is the real one, so
// what is asserted here is which run's rows come back — not that a branch returns what it was handed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PipelineEvent, PipelineOptions, PipelineResult } from "@kmodern/scraper-core";
import type * as ScraperCore from "@kmodern/scraper-core";
import { GET } from "@/app/api/admin/scraper/route";
import { scraperJobs } from "@/scraper/lib/scraper-jobs";

const { runPipelineMock } = vi.hoisted(() => ({ runPipelineMock: vi.fn() }));

vi.mock("@kmodern/scraper-core", async (importOriginal) => {
  const actual = await importOriginal<typeof ScraperCore>();
  return { ...actual, runPipeline: (options: PipelineOptions) => runPipelineMock(options) };
});

vi.mock("@/auth/lib/auth", () => ({
  requireAdminApi: vi.fn(async () => ({ ok: true, ctx: { admin: { role: "OWNER", mustChangePassword: false } } })),
}));

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

afterEach(async () => {
  finish();
  await vi.waitFor(() => expect(scraperJobs.get().status).not.toBe("running"));
});

function start(): string {
  return scraperJobs.start({ source: "all", cache: false, downloadImages: false, priceLookup: false }).id;
}

function scraped(index: number): PipelineEvent {
  return {
    type: "product-complete",
    sourceId: "datees",
    index,
    total: 10,
    name: `محصول ${index}`,
    brand: "داتیس",
    price: index * 1000,
    colors: ["black"],
    image: `https://cdn.datees.ir/p${index}.jpg`,
  };
}

async function get(query: string): Promise<Response> {
  // The handler's inferred return includes `undefined`; a route that answered nothing is a failure
  // here, not an empty body to assert on.
  const response = await GET(new NextRequest(`http://localhost:3101/api/admin/scraper${query}`));
  if (!response) throw new Error(`no response for ${query}`);
  return response;
}

describe("GET /api/admin/scraper?view=live", () => {
  it("serves the current run's rows under that run's id", async () => {
    const jobId = start();
    emit({ type: "product-start", sourceId: "datees", index: 1, total: 10, url: "https://datees.ir/product/one" });
    emit(scraped(1));

    const response = await get("?view=live");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobId).toBe(jobId);
    expect(body.status).toBe("running");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ name: "محصول 1", brand: "داتیس", url: "https://datees.ir/product/one" });
  });

  it("drops the finished run's rows once the next one starts", async () => {
    start();
    emit(scraped(1));
    emit(scraped(2));
    finish();
    await vi.waitFor(() => expect(scraperJobs.get().status).toBe("completed"));

    const nextJobId = start();
    const body = await (await get("?view=live")).json();
    expect(body.jobId).toBe(nextJobId);
    expect(body.items).toEqual([]);
  });

  it("leaves the status poll the size it was", async () => {
    start();
    emit(scraped(1));

    const body = await (await get("")).json();
    expect(body).toMatchObject({ id: scraperJobs.get().id, status: "running", records: 1 });
    expect(body).not.toHaveProperty("items");
    expect(body).not.toHaveProperty("live");
  });
});
