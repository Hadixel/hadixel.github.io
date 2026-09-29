export {
  runPipeline,
  matchesScrapeFilters,
  type PipelineEvent,
  type PipelineOptions,
  type PipelineResult,
} from "./pipeline";
export {
  SOURCES,
  datees,
  schuffel,
  categoryFor,
  type SourceAdapter,
  type SourceTaxonomy,
} from "./sources";
export { refineAndMerge } from "./merge";
export {
  normalizeFa,
  polishCopy,
  extractModel,
  extractModelForSource,
  makeSlug,
  refineDescription,
  refineFeatures,
  refineSpecs,
} from "./refine";
export { fetchHtml, fetchBuffer, fetchAsset, sniffContentType, type FetchedAsset, type FetchOptions } from "./http";
export {
  downloadProductImages,
  imageExtensionForContentType,
  type ImageDownloadOptions,
  type ImageDownloadResult,
} from "./images";
export {
  DATEES_SHOP_CATALOG_URL,
  DATEES_SHOP_ORIGIN,
  DATEES_SHOP_PRODUCTS_URL,
  fetchDateesShopPriceIndex,
  matchDateesShopPrice,
  type PriceQuote,
} from "./price-sources";
// The price-list and the source menu were reachable only by deep path, so a consumer could reach past
// this file into a module's internals and be broken by a rename inside it. They are here instead: the
// index is the scraper's public surface, and a second door to the same building is not a smaller one.
export {
  applyPriceList,
  applyPriceListReportToProducts,
  type ApplyPriceListOptions,
  type PriceListCandidate,
  type PriceListMatch,
  type PriceListMatchStatus,
  type PriceListProductTarget,
  type PriceListReport,
  type PriceListRow,
  type PriceListUpdate,
  type PriceUnit,
} from "./price-list";
export {
  SCRAPER_SOURCE_OPTIONS,
  type ScraperSourceOption,
} from "./source-options";
export type {
  ScrapeRecord,
  RefinedProduct,
  MergeReport,
  Conflict,
  RawSpec,
  ScrapeFilters,
  ScrapeFilterValue,
  ScrapePriceFilter,
  ScrapeContentFilter,
  ScrapeSort,
  PriceLookupReport,
} from "./types";
