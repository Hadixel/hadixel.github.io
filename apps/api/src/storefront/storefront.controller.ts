import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  PostListQueryDto,
  PostSlugParamDto,
  type PostDetail,
  type PostListRead,
  type SitemapRead,
  type StorefrontFooter,
  type StorefrontNav,
} from "./dto/storefront.dto.js";
import { PostNotFoundException } from "./exceptions/storefront.exception.js";
import { StorefrontService } from "./storefront.service.js";

/**
 * The storefront's public surface: the chrome, the blog and the sitemap.
 *
 * Every route here is a shopper with no session, so none of them checks an identity. That is a
 * decision, not an omission — the reads are of published rows and there is no operator or customer
 * behind them; the panel's versions of these same tables live in `nav`, `posts` and `pages`, where an
 * identity is required, and the two are kept apart so that adding a session check to a public read
 * has to be a deliberate act rather than a copy of the controller next door.
 *
 * `storefront` is the prefix rather than `content`'s, so the home page and the CMS page read keep
 * their existing paths and this feature can be removed without touching either. `content-blocks.test.ts`
 * pins that pair; the paths below are pinned the same way, in the storefront's own suite, because two
 * halves of one contract cannot be compared in one process.
 */
@Controller("storefront")
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  /**
   * The three menus, every link in them resolved.
   *
   * One read for all three locations, because the header asks for two of them and the footer for the
   * third, and reading them separately meant assembling each tree from its own moment — which is how
   * a header and a footer end up disagreeing about whether a category exists.
   */
  @Get("nav")
  async nav(): Promise<StorefrontNav> {
    return { menus: await this.storefront.menus() };
  }

  /**
   * The footer's link groups: the menu's own links, minus the ones that lead to an empty page, and
   * the root categories beside them.
   */
  @Get("footer")
  footer(): Promise<StorefrontFooter> {
    return this.storefront.footer();
  }

  /** The blog index, newest first, bounded by `limit`. */
  @Get("posts")
  async posts(@Query() query: PostListQueryDto): Promise<PostListRead> {
    return { posts: await this.storefront.posts(query.limit) };
  }

  /**
   * One published post, with the products it mentions already resolved into links.
   *
   * A post that does not exist and a post that was never published are the same 404, because to
   * anyone reading the site they are the same thing, and a draft that renders as an empty article
   * reads as a broken page rather than as one that does not exist.
   */
  @Get("posts/:slug")
  async post(@Param() params: PostSlugParamDto): Promise<PostDetail> {
    const post = await this.storefront.post(params.slug);
    if (!post) throw new PostNotFoundException();
    return post;
  }

  /**
   * The sitemap, as rows with the shop's own host left for the client to add.
   *
   * A read that cannot fail outright: a section that could not be read is named in the body rather
   * than dropped from it, so a sitemap that comes back short says so instead of quietly dropping a
   * shop's products out of the index. The reasoning is in the service; what matters here is that this
   * route answers 200 either way, because a 500 on the one URL a crawler fetches most is its own
   * kind of silent loss.
   */
  @Get("sitemap")
  sitemap(): Promise<SitemapRead> {
    return this.storefront.sitemap();
  }
}
