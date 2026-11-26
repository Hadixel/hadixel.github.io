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
// The CLI and its suite consume the argument reader and the URL guard, so both are part of the
// public surface for the same reason the price list is: a consumer that has to reach past this file
// into a module's internals is broken by a rename inside it.
export { readFlag } from "./args";
export {
  fetchHtml,
  fetchBuffer,
  fetchAsset,
  sniffContentType,
  assertSafeRemoteUrl,
  DnsLookupError,
  type FetchedAsset,
  type FetchOptions,
} from "./http";
export {
  downloadProductImages,
  imageExtensionForContentType,
  type ImageDownloadOptions,
  type ImageDownloadResult,
} from "./images";
export {
  collectImageUrls,
  type ImageCollectOptions,
} from "./product-images";
export {
  extractFromUrl,
  parseGenericProductHtml,
  isProductPage,
  extractProductLinks,
  inferCategory,
  parsePriceToman,
  type UniversalScrapeOptions,
  type UniversalScrapeResult,
} from "./universal-scraper";
export {
  DATEES_SHOP_CATALOG_URL,
  DATEES_SHOP_ORIGIN,
  DATEES_SHOP_PRODUCTS_URL,
  fetchDateesShopPriceIndex,
  matchDateesShopPrice,
  // The price watch's two questions: which quote is this product's, and which key in
  // `priceByColor` is this colour? Both are the index's own logic, so a consumer asking them
  // re-implements the answer rather than reaching the function that has it.
  matchDateesShopProductPrice,
  dateesShopColorToken,
  type PriceQuote,
} from "./price-sources";
// The price-list and the source menu were reachable only by deep path, so a consumer could reach past
// this file into a module's internals and be broken by a rename inside it. They are here instead: the
// index is the scraper's public surface, and a second door to the same building is not a smaller one.
export {
  applyPriceList,
  applyPriceListReportToProducts,
  type PriceListProductTarget,
} from "./price-list";
export type {
  ApplyPriceListOptions,
  PriceListCandidate,
  PriceListMatch,
  PriceListMatchStatus,
  PriceListReport,
  PriceListRow,
  PriceListUpdate,
  PriceUnit,
} from "./price-list-types";
// The second step: prices for the scraped products an operator selected, fetched from the shop's
// own API after the run is over. The scrape itself never carries one, so this is the only path a
// fetched price reaches the review snapshot by.
export {
  readPdfRows,
  parsePdfTextToRows,
  cleanPdfPrice,
  type ParsedPdfRows,
} from "./pdf-price-list";
export {
  fetchDateesShopPrices,
  type DateesPriceFetchReport,
  type FetchDateesPricesOptions,
} from "./price-fetch";
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
} from "./types";
