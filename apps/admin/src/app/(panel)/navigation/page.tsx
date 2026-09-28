// The navigation editor's seeds, read through the gateway.
//
// This page was the densest holdout in the panel: it imported the data tier and did everything. It
// fetched the three locations one at a time, fetched pages, root categories and collections to label
// the ids its own tree held, and then *built each tree itself* — grouping the flat rows by which
// row each one hangs from, sorting each group by its stored position, recursing — and decided what a
// stored `target` meant against a hand-written array of link type names, matched with an `includes`
// and defaulting to "no link", sitting beside the table.
// That list was a second copy of the link vocabulary the schema package holds and the write goes
// through, and the page defaulted anything it did not recognise to
// "no link at all" — so a menu item pointing at a page it had never heard of came back with no link
// and no warning.
//
// All of it is the gateway's now (`GET /nav`), which answers with the trees already nested and already
// in the field names the editor's form draws. There is nothing left to translate, so this page is the
// read and the render.

import { readThrough } from "@/lib/reads";
import { NavEditor, type NavSeed } from "@/components/nav-editor";

/** The three pickers the editor offers ids from, as the read answers them once beside the menus. */
interface NavPickers {
  categories: NavSeed["categories"];
  pages: NavSeed["pages"];
  collections: NavSeed["collections"];
}

/** One menu at one location, its tree already nested and ordered by the position it was saved at. */
interface NavMenuRead {
  location: string;
  name: string;
  items: NavSeed["items"];
}

/**
 * The editor's whole seed, as `GET /nav` answers it: the three menus, and the three pickers once
 * beside them rather than repeated inside each. Mirrored rather than imported — this file is a
 * client and the gateway is a separate process that does not share a module with it.
 */
interface NavRead extends NavPickers {
  menus: NavMenuRead[];
}

export default async function NavigationPage() {
  // Throws rather than rendering "no menu found" when the gateway is down: an unreachable gateway and
  // a shop with no menus are different facts, and only one of them is worth an operator's attention.
  const nav = await readThrough<NavRead>("/nav");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-bold text-ink">مدیریت منوها</h1>
      <p className="text-sm text-ash">هر منو به‌صورت کامل ذخیره می‌شود؛ تغییرات بلافاصله در فروشگاه اعمال می‌شود.</p>
      {nav.menus.length === 0 && <p className="text-sm text-ash">منویی یافت نشد.</p>}
      {nav.menus.map((menu) => (
        <NavEditor
          key={menu.location}
          // The three pickers are the same for every menu, so the read answers them once beside the
          // menus rather than inside each of them. Attaching them here is assembly, not translation:
          // no value is reshaped, named or defaulted on the way to the editor.
          seed={{ ...menu, categories: nav.categories, pages: nav.pages, collections: nav.collections }}
        />
      ))}
    </div>
  );
}
