// Navigation, as a thin module over the gateway.
//
// This was the last thing left in `content.ts`, and it was the only write in the panel that was honest
// about its shape from the start: a full tree replace, because that is what the editor means. What it
// also carried was the tree's vocabulary, a depth and size count implemented by throwing
// `Error("NAV_DEPTH")` and matching the text afterwards, and a check of every link's target in four
// separate queries *before* the transaction that replaced the tree.
//
// That last one is the gap worth naming: between the check and the write, a page or a collection could
// be deleted, and the menu would be saved pointing at nothing — which the storefront renders as a link
// that goes nowhere, with no error anywhere. The check is asked on the transaction's own client now.
//
// One translation is left here: **which fields the form actually sent.** An HTML form posts every input
// in the editor, blank ones included, and a tree the panel cannot read is a bug in the form rather than
// a value to guess at — saving an empty menu would empty the shop's navigation and report success.

import { field, jsonParse } from "./form-helpers";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "./result";

/** What the gateway's `SaveNavDto` accepts. Mirrors it rather than importing it. */
interface NavBody {
  location: string;
  name: string;
  items: unknown[];
}

/** Save one location's tree. */
export async function saveNavRequest(formData: FormData): Promise<ActionResult> {
  const location = field(formData, "location");
  const name = field(formData, "name");

  if (!name) return failed("نام منو الزامی است");

  const raw = formData.get("items");
  if (raw === null) return failed("ساختار منو ارسال نشده است");
  if (typeof raw === "string" && raw.length > 200_000) {
    return failed("حجم ساختار منو بیش از حد مجاز است");
  }
  const items = jsonParse<unknown>(raw as string, null);
  if (items === null || !Array.isArray(items)) return failed("ساختار منو نامعتبر است");

  const body: NavBody = { location, name, items };

  return fromGateway((client) => client.patch("/nav", body), "منو ذخیره شد");
}
