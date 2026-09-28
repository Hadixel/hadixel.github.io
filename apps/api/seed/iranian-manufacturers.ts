// The list itself moved to `@kmodern/schema`. It is not seed material — the storefront renders it and a
// test asserts against it — and it reached here by way of a package shim forwarding into this
// directory, which is a package importing an app for a list of brand names.

export { IRANIAN_MANUFACTURERS, type IranianManufacturer } from "@kmodern/schema/manufacturers";
