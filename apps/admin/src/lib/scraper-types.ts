import type { ScrapeFilters } from "@kmodern/scraper";

export type { ScrapeFilters } from "@kmodern/scraper";

export type ScraperJobStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export type ScraperJobPhase = "idle" | "discovering" | "scraping" | "refining" | "downloading" | "writing" | "complete";

export interface ScraperJobOptions {
  source: string;
  limit?: number;
  cache: boolean;
  downloadImages?: boolean;
  filters?: ScrapeFilters;
}

export interface ScraperCatalogItem {
  _id: string;
  slug: string;
  name: string;
  brand: string;
  sourceId?: string;
  sourceUrl?: string;
  sourcePageUrl?: string;
  category: string;
  subCategory: string;
  colors: string[];
  price: number;
  bestSeller: boolean;
  date: number;
  image: string[];
  sourceImages?: string[];
  description: string;
  features: string[];
  specs: Array<{ label: string; value: string }>;
}

export interface ScraperJobSnapshot {
  id: string;
  status: ScraperJobStatus;
  phase: ScraperJobPhase;
  source: string;
  limit: number | null;
  cache: boolean;
  downloadImages: boolean;
  filters: ScrapeFilters;
  startedAt: string | null;
  finishedAt: string | null;
  current: number;
  total: number;
  records: number;
  kept: number;
  merged: number;
  conflicts: number;
  errors: number;
  filteredOut: number;
  imageErrors: number;
  imagesDownloaded: number;
  imagesTotal: number;
  outputDir: string | null;
  error: string | null;
  activity: string[];
}
