// The public catalogue, as the storefront reads it.
//
// Deliberately the only feature on the gateway with no operator check and no customer check: these
// are the reads a logged-out visitor makes, and a session requirement on any of them would be a
// storefront that cannot be looked at without an account.
//
// The prefix is `catalogue` and the paths under it are plural, so a category page asks for
// `/catalogue/categories/:slug` and a listing asks for `/catalogue/products`. Each read answers one
// question; none of them composes another, so a listing page asks the gateway twice and the two
// answers cannot disagree about a product because they were one read.

import { Controller, Get, Param, Query } from "@nestjs/common";
import { CatalogueService } from "./catalogue.service.js";
import {
  CatalogueProductQueryDto,
  SlugParamDto,
  type CatalogueCollection,
  type CatalogueProduct,
  type CatalogueProductDetail,
  type CategorySummary,
  type CategoryTreeResponse,
  type CollectionSummary,
} from "./dto/catalogue.dto.js";
import { CatalogueNotFoundException } from "./exceptions/catalogue.exception.js";

@Controller("catalogue")
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  /** The whole tree, nested and flat, for the storefront's navigation. */
  @Get("categories")
  async categories(): Promise<CategoryTreeResponse> {
    return this.catalogue.categoryTree();
  }

  /**
   * One category by slug.
   *
   * A 404 rather than an empty tree, because a category page that renders "no such category" with a
   * full sidebar around it is a page that looks like a shop with nothing in it.
   */
  @Get("categories/:slug")
  async category(@Param() params: SlugParamDto): Promise<CategorySummary> {
    const category = await this.catalogue.categoryBySlug(params.slug);
    if (!category) throw new CatalogueNotFoundException("دسته‌بندی مورد نظر پیدا نشد.");
    return category;
  }

  /** The collections, each with the products a shopper sees on it. */
  @Get("collections")
  async collections(): Promise<CatalogueCollection[]> {
    return this.catalogue.collections();
  }

  /**
   * One collection by slug.
   *
   * A 404, for the reason the category route gives: an absent collection and an empty one are not
   * the same page, and only one of them is a mistake.
   */
  @Get("collections/:slug")
  async collection(@Param() params: SlugParamDto): Promise<CollectionSummary> {
    const collection = await this.catalogue.collectionBySlug(params.slug);
    if (!collection) throw new CatalogueNotFoundException("کلکسیون مورد نظر پیدا نشد.");
    return collection;
  }

  /**
   * The product listing, filtered.
   *
   * No status parameter, and that is the point: a public read that offers the caller a choice of
   * status is a read whose rule is the caller's. `PUBLISHED` is the only answer this route has.
   */
  @Get("products")
  async products(@Query() query: CatalogueProductQueryDto): Promise<CatalogueProduct[]> {
    return this.catalogue.publishedProducts({
      categoryId: query.categoryId,
      collectionId: query.collectionId,
      search: query.search,
      limit: query.limit,
      sort: query.sort,
    });
  }

  /**
   * One product by slug.
   *
   * A 404 for a draft as well as for an absent row, so that a shopper cannot reach unpublished work
   * by guessing a slug — which is the only way they could.
   */
  @Get("products/:slug")
  async product(@Param() params: SlugParamDto): Promise<CatalogueProductDetail> {
    const product = await this.catalogue.productBySlug(params.slug);
    if (!product) throw new CatalogueNotFoundException("محصول مورد نظر پیدا نشد.");
    return product;
  }
}
