import { GatewayError, gateway } from "@/lib/gateway";

/**
 * The chrome's menus, read from the gateway.
 *
 * This module used to open a database connection and resolve every link in a menu itself: one
 * `findUnique` per menu item, per child and per promo, then a tree assembled in the component that
 * drew it. Eleven links in the header meant eleven queries to render a row of labels, and the whole
 * of it happened while a page was rendering.
 *
 * The gateway now answers the question in one read — all three menus, every link already an href —
 * and this module is left with the wire shape and the two small reads the header and the footer
 * make. A link is a link here: nothing in the storefront resolves a target id, because the only
 * component that used to was the one that could not do it without holding a query open.
 *
 * The two exports the chrome calls (`getNavMenu`, and the read behind the footer) each ask for the
 * whole `nav` response. Next deduplicates identical GETs inside one render, so the header's two calls
 * — `HEADER` for the category row, `MOBILE` for the drawer — are one request, and the two trees come
 * from the same moment rather than from two that happen to be close together.
 */

export type NavLocation = "HEADER" | "FOOTER" | "MOBILE";
export type NavDisplay = "DROPDOWN" | "MEGA";

export interface NavPromo {
  imageUrl: string;
  alt: string;
  href: string;
  newTab: boolean;
  heading?: string;
  subtext?: string;
}

export interface NavNode {
  id: string;
  label: string;
  href: string;
  newTab: boolean;
  display: NavDisplay;
  children: NavNode[];
  promos: NavPromo[];
}

export interface NavMenu {
  location: NavLocation;
  name: string;
  tree: NavNode[];
}

export interface FooterLink {
  href: string;
  label: string;
}

export interface NavView {
  menus: NavMenu[];
  /** A shopper-facing reason the menus are not here, or null when they are. */
  failure: string | null;
}

export interface FooterView {
  /** The menu's own name, which titles the first group. Null when no footer menu is configured. */
  name: string | null;
  links: FooterLink[];
  categories: FooterLink[];
  failure: string | null;
}

/** Every menu, with the reason there are none when there are none. */
export async function loadNav(): Promise<NavView> {
  try {
    const client = await gateway();
    const body = await client.get<unknown>("/storefront/nav");
    if (!isNavResponse(body)) {
      // A 200 in a shape nobody agreed on is a contract break between two processes, and answering it
      // with an empty menu would turn a deployment mistake into a storefront with no navigation and no
      // error anywhere. It is reported instead.
      return { menus: [], failure: "پاسخ درگاه با ساختار مورد انتظار نخواند." };
    }
    return { menus: body.menus, failure: null };
  } catch (error) {
    if (!(error instanceof GatewayError)) throw error;
    console.error("[store] navigation read failed; rendering the chrome without menus", error);
    return { menus: [], failure: error.message };
  }
}

/**
 * One menu, or null when there is none to draw.
 *
 * A null here is either "the shop has no menu at this location" or "the gateway could not be asked",
 * and the chrome cannot tell them apart any more than it could before: both draw the same page
 * without a menu. What changed is that the second one is now logged rather than silent, so the
 * difference is visible to whoever is looking at the server rather than guessed at from the page.
 */
export async function getNavMenu(location: NavLocation): Promise<NavMenu | null> {
  const nav = await loadNav();
  return nav.menus.find((menu) => menu.location === location) ?? null;
}

/**
 * The footer's link groups.
 *
 * The footer's question is not the header's: it wants the menu's *name* and its top-level links, with
 * the ones pointing at a page with nothing published on them removed, beside the root categories.
 * That is a rule about two tables at once, so it is answered by the gateway and asserted there —
 * the footer used to read every page row and compare resolved hrefs by string to apply it.
 */
export async function loadFooter(): Promise<FooterView> {
  try {
    const client = await gateway();
    const body = await client.get<unknown>("/storefront/footer");
    if (!isFooterResponse(body)) {
      return { name: null, links: [], categories: [], failure: "پاسخ درگاه با ساختار مورد انتظار نخواند." };
    }
    return { name: body.name, links: body.links, categories: body.categories, failure: null };
  } catch (error) {
    if (!(error instanceof GatewayError)) throw error;
    console.error("[store] footer read failed; rendering the footer without its link groups", error);
    return { name: null, links: [], categories: [], failure: error.message };
  }
}

/**
 * A link a block carries, passed through.
 *
 * The gateway turns every link a CMS block holds into an href before the block leaves it, so a
 * renderer drawing a resolved link has nothing to do here. A value that is not a finished link — a
 * raw target, a missing node — resolves to `#`, which draws as a link that goes nowhere rather than
 * as a link that goes somewhere wrong.
 *
 * That case is a caller's to fix rather than a guess to make here: resolving a target id needs the
 * data tier, and this module no longer has one.
 */
export async function hrefFor(link: unknown): Promise<{ href: string; newTab: boolean }> {
  if (link && typeof link === "object" && "href" in link && typeof link.href === "string") {
    const newTab = "newTab" in link ? link.newTab : false;
    return { href: link.href, newTab: newTab === true };
  }
  return { href: "#", newTab: false };
}

function isNavResponse(body: unknown): body is { menus: NavMenu[] } {
  if (!body || typeof body !== "object") return false;
  return Array.isArray((body as Record<string, unknown>).menus);
}

function isFooterResponse(body: unknown): body is { name: string | null; links: FooterLink[]; categories: FooterLink[] } {
  if (!body || typeof body !== "object") return false;
  const candidate = body as Record<string, unknown>;
  return (
    (candidate.name === null || typeof candidate.name === "string") &&
    Array.isArray(candidate.links) &&
    Array.isArray(candidate.categories)
  );
}
