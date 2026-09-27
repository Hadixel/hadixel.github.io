// The storefront's session module used to live here.
//
// It issued one-time codes, verified them, created customers, minted session tokens, hashed them, wrote
// `CustomerSession` rows and set the cookie — all of it beside the shopper, which meant the shopper held
// the rules that decided who is signed in. It also had no revocation, so the sign-out route re-implemented
// one: two copies of "end this session", and the copy that ran was the route handler's.
//
// All of that is the gateway's now, in `apps/api/src/auth`. This file is a re-export so the components
// that import `currentCustomer` from here keep working; nothing new should import from it. The four
// call sites the storefront owns have been pointed at `@/lib/customer-session` directly, and the fifth
// is a file being edited in another working tree, which is why this shim exists at all rather than that
// one line being changed.
//
// It will be deleted with ticket 15, when the last direct data path closes.

export {
  currentCustomer,
  CUSTOMER_COOKIE,
  GatewayError,
} from "./customer-session";
