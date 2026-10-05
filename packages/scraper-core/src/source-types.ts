// The shape every source adapter implements.
//
// These live apart from `sources.ts` for one reason: the adapter registry and the adapters it
// registers used to define and consume them in the same pair of files, which made
// `schuffel.ts -> sources.ts -> schuffel.ts` a cycle — the one thing "no cycle at file scope"
// (§15.1) exists to keep out. An adapter needs the interface to describe itself, the registry needs
// the interface to hold them, and neither can be written without the other. Put the contract in its
// own file and both point down at it, which is what a contract is for.

import type { FetchOptions } from "./http";
import type { ScrapeRecord } from "./types";

export interface SourceTaxonomy {
  category: string;
  subCategory: string;
}

export interface SourceAdapter {
  id: string; // stable key, recorded on every ScrapeRecord
  brand: string; // default Brand attribution
  /** Optional brands emitted by a multi-brand source. */
  brands?: string[];
  /** Discover all product URLs (category crawl or flat list). */
  listProducts(fetchOpts?: FetchOptions): Promise<string[]>;
  /** Optional taxonomy learned while discovering a product URL. */
  taxonomyFor?(url: string): SourceTaxonomy | null;
  /** Extract one product page. Throw on unrecoverable parse failure. */
  parseProduct(url: string, html: string): ScrapeRecord;
  /** Optional API-backed record seam; avoids fetching a page already listed. */
  productFor?(url: string): ScrapeRecord | undefined | Promise<ScrapeRecord | undefined>;
}
