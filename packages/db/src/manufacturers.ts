// TEMPORARY, with the rest of this package. Iranian manufacturer names are domain data that the
// storefront's test reads; it reached into the seed directory by relative path, which crossed a
// workspace wall with no manifest edge behind it. Forwarding it keeps the edge declared and lets it
// disappear with the shim. The data's real home is the kernel — it is not seed material — and that
// move belongs with the kernel rename.

export { IRANIAN_MANUFACTURERS } from "@kmodern/api/manufacturers";
