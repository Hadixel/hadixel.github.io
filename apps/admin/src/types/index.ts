// The app-level types — the ones no single feature owns.
//
// Blueprint §9.4 puts `types/` beside `components/` and `lib/` as the third app-wide shelf, and §3
// rule 5 ("one home for one rule") is what decides what belongs on it: a type used by the root
// layout, or by three or more unrelated features, is not that of any one of them. A type used by one
// feature belongs to that feature's root, beside the module that produces it, so a grep for the
// feature finds the whole of it.
//
// This client had no such shelf: every type it declared was declared inside the module that happened
// to need it, which is fine until a second module needs it too and the second one has to reach
// across a feature boundary to import it. `@/lib/actions/ctx.ts` — which is app-wide by rule, because
// every server action in the panel shares it — had to import the operator's context from the auth
// feature's own module for exactly that reason. That is the smell this file is the answer to.

/** What the gateway says about the caller. Never the admin row: see `GET /auth/admin/me`. */
export interface AdminContext {
  session: { id: string };
  admin: {
    id: string;
    email: string;
    name: string;
    /**
     * The role, as the union of the values the gateway can send rather than as `string`.
     *
     * Narrowing it here is the point: `role: string` would let `role === "OWNER"` compile even if the
     * gateway sent something else, and the three scraper routes and the panel layout all gate on
     * exactly that comparison. The three values are written out because importing the generated enum
     * would be the data dependency the clients exist to avoid.
     */
    role: "OWNER" | "EDITOR" | "ORDER_MANAGER";
    mustChangePassword: boolean;
  };
}
