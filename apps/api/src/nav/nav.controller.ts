// Navigation, at the operator's edge — a whole tree replaced per location.
//
// The panel's version was a full replace already, and it did that part honestly. What it also did was
// run the tree's vocabulary itself, count the depth and size by throwing `Error("NAV_DEPTH")` and
// matching the text, and check every link's target in four separate queries *before* the transaction
// that replaced the tree. That last one is the gap: between the check and the write, a page or a
// collection could be deleted, and the menu would then be saved pointing at nothing — which the
// storefront renders as a link that goes nowhere, with no error anywhere.

import { Body, Controller, Inject, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { MenuItemValue } from "@kmodern/schema";
import { SaveNavDto } from "./dto/nav.dto.js";
import { MenuNotFoundException, NavTargetMissingException } from "./exceptions/nav.exception.js";
import { collectTargets, parseMenu } from "./nav.service.js";

type Tx = Prisma.TransactionClient;

@Controller("nav")
export class NavController {
  constructor(
    private readonly auth: AuthService,
    // The data client arrives through the module that owns it, the same as every other feature.
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  /**
   * Replace one location's tree.
   *
   * `PATCH` on a location rather than a create: the shop's three menus are seeded, and the operator
   * edits what is there. A `POST` would have to answer "already exists" for the only three valid
   * requests it could receive.
   */
  @Patch()
  async save(@Req() req: Request, @Body() body: SaveNavDto): Promise<{ items: number }> {
    const admin = await requireAdmin(this.auth, req);

    // The menu row is looked up before the transaction rather than inside it, so a location the shop
    // has no menu for is a 404 rather than a "not found" discovered halfway through a replace.
    const menu = await this.db.menu.findUnique({ where: { location: body.location } });
    if (!menu) throw new MenuNotFoundException(body.location);

    return this.db.$transaction(async (tx) => {
      // Judged before any write, and inside the transaction — the panel judged before the write and
      // *outside* the transaction, which is the whole gap.
      const items = parseMenu({ location: body.location, name: body.name, items: body.items });

      // Every target exists, asked once for all four kinds rather than one query per link, and asked
      // on the transaction's own client so the answer and the replace cannot disagree.
      const { targetKeys, categoryIds } = collectTargets(items);
      await assertTargetsExist(tx, targetKeys, categoryIds);

      await tx.menuItem.deleteMany({ where: { menuId: menu.id } });
      await tx.menu.update({ where: { id: menu.id }, data: { name: body.name } });

      for (const [index, item] of items.entries()) {
        await createItem(tx, menu.id, item, null, index);
      }

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "MENU_SAVED",
        entityType: "MENU",
        entityId: menu.id,
        meta: { location: body.location, itemCount: items.length },
      });

      return { items: items.length };
    });
  }
}

/**
 * Write an item and its children, depth first.
 *
 * Recursive because the tree is recursive, and it has to be: the alternative is a breadth-first pass
 * that rewrites every row afterwards to fix its `parentId`, which is two writes per item instead of one.
 */
async function createItem(
  tx: Tx,
  menuId: string,
  item: MenuItemValue,
  parentId: string | null,
  sortOrder: number,
): Promise<void> {
  const created = await tx.menuItem.create({
    data: {
      menuId,
      parentId,
      sortOrder,
      label: item.label,
      target: item.target as never,
      childSource: item.childSource ?? "STATIC",
      categoryId: item.categoryId || null,
      display: item.display ?? "DROPDOWN",
      visible: item.visible ?? true,
      mobileVisible: item.mobileVisible ?? true,
      promos: {
        create: (item.promos ?? []).map((promo, index) => ({
          sortOrder: index,
          imageUrl: promo.imageUrl,
          alt: promo.alt ?? "",
          link: promo.link as never,
          heading: promo.heading ?? null,
          subtext: promo.subtext ?? null,
          mobileVisible: promo.mobileVisible ?? false,
        })),
      },
    },
    select: { id: true },
  });

  for (const [index, child] of (item.children ?? []).entries()) {
    await createItem(tx, menuId, child, created.id, index);
  }
}

/**
 * Every page, category, collection and post the tree names is still there.
 *
 * Asked on the transaction's client and answered with the keys that were missing, so the sentence an
 * operator reads names the links they have to fix rather than saying that one of them is wrong.
 */
async function assertTargetsExist(
  tx: Tx,
  targetKeys: Set<string>,
  categoryIds: Set<string>,
): Promise<void> {
  const byType = (prefix: string): string[] =>
    [...targetKeys].filter((key) => key.startsWith(`${prefix}:`)).map((key) => key.slice(prefix.length + 1));

  const pageIds = byType("PAGE");
  const collectionIds = byType("COLLECTION");
  const postIds = byType("BLOG_POST");
  const linkedCategoryIds = byType("CATEGORY");

  // A menu's own category sources are checked alongside the categories its links point at: the panel
  // checked both, and a category that is either missing makes the same broken dropdown.
  const allCategoryIds = [...new Set([...linkedCategoryIds, ...categoryIds])];

  const [pages, categories, collections, posts] = await Promise.all([
    pageIds.length > 0 ? tx.page.findMany({ where: { id: { in: pageIds } }, select: { id: true } }) : [],
    allCategoryIds.length > 0
      ? tx.category.findMany({ where: { id: { in: allCategoryIds } }, select: { id: true } })
      : [],
    collectionIds.length > 0
      ? tx.collection.findMany({ where: { id: { in: collectionIds } }, select: { id: true } })
      : [],
    postIds.length > 0 ? tx.post.findMany({ where: { id: { in: postIds } }, select: { id: true } }) : [],
  ]);

  const found = new Set<string>();
  for (const row of pages) found.add(`PAGE:${row.id}`);
  for (const row of categories) {
    found.add(`CATEGORY:${row.id}`);
    // A category named as a child source has no `target` of its own, so it is matched by id alone.
    if (categoryIds.has(row.id)) found.add(`CHILDREN:${row.id}`);
  }
  for (const row of collections) found.add(`COLLECTION:${row.id}`);
  for (const row of posts) found.add(`BLOG_POST:${row.id}`);

  const missing: string[] = [];
  for (const key of targetKeys) {
    if (!found.has(key)) missing.push(key);
  }
  for (const id of categoryIds) {
    if (!found.has(`CHILDREN:${id}`)) missing.push(`دستهٔ منو: ${id}`);
  }

  if (missing.length > 0) throw new NavTargetMissingException(missing);
}
