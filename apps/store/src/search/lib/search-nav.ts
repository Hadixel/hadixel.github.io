import { rememberRecent } from "@/search/lib/recent-searches";

type ListingRouter = { push: (url: string) => void; refresh: () => void };

/*
 * Submit-to-listing semantics shared by every search entry point
 * (desktop Enter, magnifier button, mobile Enter, panel chips):
 * record the term, then navigate — or, when already sitting on the
 * exact same listing, re-run it instead of a no-op push.
 */
export function submitListing(router: ListingRouter, term: string) {
  const t = term.trim();
  rememberRecent(t);
  const current = new URLSearchParams(window.location.search).get("q");
  if (window.location.pathname === "/products" && current === t) {
    router.refresh();
    return;
  }
  router.push(`/products?q=${encodeURIComponent(t)}`);
}
