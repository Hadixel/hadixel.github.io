// What a navigation tree may be.
//
// `menuSchema` is the vocabulary and the service's to run, for the reason the page and post vocabularies
// are: the panel ran it itself as a fast-fail before its own write, and a fast-fail a client owns is a
// rule a client may skip.
//
// The depth and size checks are here rather than in the schema because they are statements about the
// *whole* tree, and the schema describes one item at a time. The panel threw bare
// `Error("NAV_DEPTH")` and matched the text afterwards, which is a rule about a string.

import { menuSchema, type MenuItemValue } from "@kmodern/schema";
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
