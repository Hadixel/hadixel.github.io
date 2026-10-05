// What a navigation tree may be.
//
// `menuSchema` is the vocabulary and the service's to run, for the reason the page and post vocabularies
// are: the panel ran it itself as a fast-fail before its own write, and a fast-fail a client owns is a
// rule a client may skip.
//
// The depth and size checks are here rather than in the schema because they are statements about the
// *whole* tree, and the schema describes one item at a time. The panel threw bare
// `Error("NAV_DEPTH")` and matched the text afterwards, which is a rule about a string.

import { linkRefSchema, menuSchema, type MenuItemValue } from "@kmodern/contracts";
import { NavRuleException } from "./exceptions/nav.exception.js";
import { MAX_DEPTH, MAX_TOTAL_ITEMS } from "./dto/nav.dto.js";

/**
 * Every target the tree names, and every category it sources children from.
 *
 * Collected once so the existence check is one set of queries rather than one per link, and returned
 * keyed by the `TYPE:id` form the editor sent — which is what the error message quotes back.
 */
export function collectTargets(items: MenuItemValue[]): {
  targetKeys: Set<string>;
  categoryIds: Set<string>;
} {
  const targetKeys = new Set<string>();
  const categoryIds = new Set<string>();

  const walk = (nodes: MenuItemValue[]): void => {
    for (const node of nodes) {
      if ("targetId" in node.target) targetKeys.add(`${node.target.type}:${node.target.targetId}`);
      if (node.childSource === "CATEGORY" && node.categoryId) categoryIds.add(node.categoryId);
      for (const promo of node.promos) {
        if ("targetId" in promo.link) targetKeys.add(`${promo.link.type}:${promo.link.targetId}`);
      }
      walk(node.children);
    }
  };

  walk(items);
  return { targetKeys, categoryIds };
}

/**
 * The tree, judged: shaped, bounded, and every category source named.
 *
 * Throws rather than returning a result union, like every other rule here.
 */
export function parseMenu(input: {
  location: string;
  name: string;
  items: unknown[];
}): MenuItemValue[] {
  const parsed = menuSchema.safeParse(input);
  if (!parsed.success) {
    throw new NavRuleException(`ساختار منو نامعتبر است: ${parsed.error.issues[0]?.message ?? ""}`);
  }

  // A `childSource: CATEGORY` item with no category renders as an empty dropdown — a menu entry that
  // goes somewhere with nothing in it, which the operator cannot see the cause of.
  for (const item of parsed.data.items) {
    if (walkTree(item, (node) => node.childSource === "CATEGORY" && !node.categoryId)) {
      throw new NavRuleException("برای منوی خودکار دسته را انتخاب کنید");
    }
  }

  assertTreeBounds(parsed.data.items);
  return parsed.data.items;
}

/** Run a predicate over every node in the tree. One traversal, reused by the two whole-tree rules. */
function walkTree(item: MenuItemValue, predicate: (node: MenuItemValue) => boolean): boolean {
  if (predicate(item)) return true;
  return item.children.some((child) => walkTree(child, predicate));
}

/**
 * Depth and size, over the whole tree.
 *
 * The schema bounds each item's own children and promos; neither bounds how deep the tree goes or how
 * many nodes it holds in total, and both are statements about the tree rather than about a node.
 */
function assertTreeBounds(items: MenuItemValue[]): void {
  let count = 0;

  const walk = (nodes: MenuItemValue[], depth: number): void => {
    if (depth > MAX_DEPTH) throw new NavRuleException("عمق منو بیش از حد مجاز است");
    for (const node of nodes) {
      count += 1;
      if (count > MAX_TOTAL_ITEMS) throw new NavRuleException("تعداد آیتم‌های منو بیش از حد مجاز است");
      walk(node.children, depth + 1);
    }
  };

  walk(items, 1);
}

/** The largest the tree may be as a string, before it is even parsed. */
export function assertTreeSize(serialized: string): void {
  if (serialized.length > 200_000) {
    throw new NavRuleException("حجم ساختار منو بیش از حد مجاز است");
  }
}

// ---- The panel's read ----
//
// The panel assembled each menu's tree in its page: group the flat rows by `parentId`, sort each
// group by `sortOrder`, recurse, and then decide — in the page, in a `["PAGE", "CATEGORY", …]
// .includes(rawType) ? rawType : "NONE"` — what a stored `target` means. That last part was a second
// copy of the link vocabulary the schema package already holds, and it defaulted a target it did not
// recognise to `NONE`, which is how a menu item pointing at a page the panel had never heard of came
// back as an item with no link and no warning.
//
// So the tree is built here, and the target is read through `linkRefSchema` rather than a hand-written
// list of type names. A stored target the schema refuses is reported as `NONE` — the same answer, but
// now from the one vocabulary the write also went through, so a target the gateway would refuse to
// store and a target it cannot read are the same set.

/** The link types the editor offers, in the order it lists them. */
export const LINK_TYPES = [
  "PAGE",
  "CATEGORY",
  "COLLECTION",
  "BLOG_INDEX",
  "BLOG_POST",
  "EXTERNAL",
  "NONE",
] as const;

export type LinkType = (typeof LINK_TYPES)[number];

/**
 * A stored `target`, as the editor's form holds it.
 *
 * `targetValue` rather than `url`/`targetId` because the editor has one field per link and picks the
 * type from a dropdown beside it: an item pointing at a page holds that page's id in the same box an
 * external link holds its URL, and `targetType` is what says which. Answering with the stored shape
 * instead would leave the page unpacking `{ type, targetId }` into two of its own fields, which is the
 * translation this read exists to remove.
 */
export interface NavTarget {
  targetType: LinkType;
  targetValue: string;
}

/**
 * A stored `target` or promo `link`, read through the shared vocabulary.
 *
 * A target the schema refuses becomes `NONE` with no value. That is the same answer the panel gave,
 * and it is now given by the one schema the write also went through — so a target the gateway would
 * refuse to store and a target it cannot read are the same set, which they were not when the page
 * compared the type against a list of strings written beside a table.
 */
export function readTarget(raw: unknown): NavTarget {
  const parsed = linkRefSchema.safeParse(raw);
  if (!parsed.success) return { targetType: "NONE", targetValue: "" };

  const link = parsed.data;
  if (link.type === "EXTERNAL") return { targetType: "EXTERNAL", targetValue: link.url };
  if (link.type === "BLOG_INDEX" || link.type === "NONE") return { targetType: link.type, targetValue: "" };
  return { targetType: link.type, targetValue: link.targetId };
}

/**
 * A promo's stored `link`, in the two fields the editor's promo form draws.
 *
 * The same read as `readTarget`, under the promo form's own field names. A separate function rather
 * than a rename at the call site, because a rename at the call site is a translation — the thing this
 * read exists to have the gateway do.
 */
export function readLink(raw: unknown): { linkType: LinkType; linkValue: string } {
  const { targetType, targetValue } = readTarget(raw);
  return { linkType: targetType, linkValue: targetValue };
}

/**
 * One menu item, in the field names the editor's form uses.
 *
 * Flat rather than nested on purpose: `targetType`/`targetValue` and `linkType`/`linkValue` are the
 * boxes the form draws, and a read that answered with the stored `{ type, targetId }` shape would
 * leave the page unpacking one into the other — the translation the whole read exists to remove.
 */
export interface NavItemView {
  key: string;
  label: string;
  targetType: LinkType;
  targetValue: string;
  childSource: "STATIC" | "CATEGORY";
  categoryId: string;
  display: "DROPDOWN" | "MEGA";
  visible: boolean;
  mobileVisible: boolean;
  children: NavItemView[];
  promos: {
    imageUrl: string;
    alt: string;
    linkType: LinkType;
    linkValue: string;
    heading: string;
    subtext: string;
    mobileVisible: boolean;
  }[];
}

/** A flat menu row with its promos, which is the shape the tree is built from. */
export interface MenuRow {
  id: string;
  parentId: string | null;
  sortOrder: number;
  label: string;
  target: unknown;
  childSource: string;
  categoryId: string | null;
  display: string;
  visible: boolean;
  mobileVisible: boolean;
  promos: {
    imageUrl: string;
    alt: string;
    link: unknown;
    heading: string | null;
    subtext: string | null;
    mobileVisible: boolean;
  }[];
}

/**
 * A menu's flat rows, nested and ordered, as the editor renders them.
 *
 * Roots first at every level, by `sortOrder` — the order the panel's page imposed, and the order the
 * write stores, so a menu that was saved comes back the way it was left. An item whose `parentId`
 * names a row that is not in this menu is not rendered: it is unreachable from the root, so showing
 * it would be showing an item the storefront cannot reach either.
 */
export function nestMenu(items: readonly MenuRow[]): NavItemView[] {
  const byParent = new Map<string | null, MenuRow[]>();
  for (const item of items) {
    const key = item.parentId ?? null;
    const group = byParent.get(key) ?? [];
    group.push(item);
    byParent.set(key, group);
  }

  const build = (parentId: string | null): NavItemView[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        key: item.id,
        label: item.label,
        ...readTarget(item.target),
        childSource: item.childSource as NavItemView["childSource"],
        categoryId: item.categoryId ?? "",
        display: item.display as NavItemView["display"],
        visible: item.visible,
        mobileVisible: item.mobileVisible,
        children: build(item.id),
        promos: (item.promos ?? []).map((promo) => ({
          imageUrl: promo.imageUrl,
          alt: promo.alt ?? "",
          ...readLink(promo.link),
          heading: promo.heading ?? "",
          subtext: promo.subtext ?? "",
          mobileVisible: promo.mobileVisible,
        })),
      }));

  return build(null);
}
