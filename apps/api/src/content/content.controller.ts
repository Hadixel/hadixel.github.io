import { Controller, Get, Query } from "@nestjs/common";
import { ContentService } from "./content.service.js";
import { HomeQueryDto, type HomeDeal, type HomeProduct } from "./dto/home.dto.js";

export interface HomeResponse {
  blocks: unknown[];
  products: HomeProduct[];
  deals: HomeDeal[];
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
 */
@Controller("content/home")
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  async home(@Query() query: HomeQueryDto): Promise<HomeResponse> {
    const page = await this.content.publishedPage("home");
    const [products, deals] = await Promise.all([
      this.content.publishedProducts(query.limit),
      this.content.activeDeals(query.dealsLimit),
    ]);
    return {
      blocks: Array.isArray(page?.publishedBlocks) ? page.publishedBlocks : [],
      products,
      deals,
    };
  }
}
