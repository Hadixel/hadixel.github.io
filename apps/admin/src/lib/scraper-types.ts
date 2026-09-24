export type ScraperJobStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export type ScraperJobPhase = "idle" | "discovering" | "scraping" | "refining" | "writing" | "complete";

export interface ScraperJobOptions {
  source: string;
  limit?: number;
  cache: boolean;
}

export interface ScraperCatalogItem {
  _id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  subCategory: string;
  colors: string[];
  price: number;
  bestSeller: boolean;
  date: number;
  image: string[];
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
  startedAt: string | null;
  finishedAt: string | null;
  current: number;
  total: number;
  records: number;
  kept: number;
  merged: number;
  conflicts: number;
  errors: number;
  outputDir: string | null;
  error: string | null;
  activity: string[];
}
