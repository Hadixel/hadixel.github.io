import { Controller, Get, NotFoundException as NestNotFound, Param, Query } from "@nestjs/common";
import { NotFoundException } from "../common/exceptions/gateway.exception.js";
import { ContentService } from "./content.service.js";
import {
  HomeQueryDto,
  PageSlugParamDto,
  type HomeDeal,
  type HomeProduct,
  type ResolvedBlock,
} from "./dto/home.dto.js";

export interface HomeResponse {
  blocks: ResolvedBlock[];
  products: HomeProduct[];
  deals: HomeDeal[];
}

export interface PageResponse {
  slug: string;
  title: string;
  blocks: ResolvedBlock[];
}

/**
 * The storefront's home page, as one read.
 *
 * One route rather than three because the page needs all three and renders them together: a shopper
 * loading the home page should not make three round trips to render one screen, and three separate
 * reads could each observe a different moment.
 *
 * The page is a CMS page whose blocks come from the database, so the response is the blocks plus
 * the fallback content the storefront used to fetch itself. The storefront keeps the decision
 * about which to render; the gateway keeps the rules about what it may see.
 *
 * Each block arrives with its own data already attached. That is what makes criterion 8 true rather
 * than aspirational: a block that resolved itself at render time meant the page held a database
 * connection while it rendered, and no amount of care in the page component changes that.
 *
 * The prefix is `content` and not `content/home` because the slug route below is a sibling of this
 * one, not a child of it: mounting the pair under `content/home` would serve the page read from
 * `/content/home/pages/:slug` while every client asks for `/content/pages/:slug`, and the mismatch
 * is invisible until a page 404s in production. `content-blocks.test.ts` asserts the two agree.
 */
@Controller("content")
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get("home")
  async home(@Query() query: HomeQueryDto): Promise<HomeResponse> {
    const page = await this.content.publishedPage("home");
    const [products, deals, blocks] = await Promise.all([
      this.content.publishedProducts({ limit: query.limit }),
      this.content.activeDeals(query.dealsLimit),
      this.content.resolveBlocks(page?.publishedBlocks),
    ]);
    return { blocks, products, deals };
  }

  /**
   * One CMS page by slug, with its blocks resolved.
   *
   * The same read the home route performs, for every other page-builder page. It exists because the
   * block renderer no longer resolves anything itself: a client that renders blocks has to be given
   * resolved blocks, so the route that renders a CMS page by slug asks here rather than reading the
   * page row directly.
   *
   * An unpublished or absent page is a 404, not an empty page. The distinction matters — a draft
   * that renders as a blank page looks like a broken site rather than a page that does not exist.
   */
  @Get("pages/:slug")
  async page(@Param() params: PageSlugParamDto): Promise<PageResponse> {
    const page = await this.content.publishedPageWithTitle(params.slug);
    if (!page) throw new NotFoundException("صفحه مورد نظر پیدا نشد.");
    const blocks = await this.content.resolveBlocks(page.publishedBlocks);
    return { slug: page.slug, title: page.title, blocks };
  }
}
