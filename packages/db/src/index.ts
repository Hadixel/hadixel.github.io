// TEMPORARY. This package is the forwarding shim described in the adoption plan's P2: the data
// tier now belongs to the gateway, and this file keeps the ~60 existing call sites compiling while
// they are migrated one resource at a time.
//
// It exists because §5.5 says a database package does not exist, and the whole point of the
// migration is that this file does not. Nothing should import it except the two clients, and the
// audit prints that count until it is zero — at which point this package is deleted and the
// clients import the gateway directly.
//
// The line below is the one edge in the repo where a packages/* workspace reaches up into an
// apps/* one, which §5.1 ("nothing imports an app") and §4's rank rule both forbid. It exists
// because the data tier moved and 60-odd call sites had to keep compiling through something, and
// the alternative — deleting packages/db in the same commit — breaks both clients at once. It is
// the only edge of its kind, it is counted, and the count may only fall: the audit holds it at 1
// and fails at 2. May it be copied? No. It is deleted in the last slice of P2, with this package
// and this directive together.

// @boundaries-ignore no-app-imported-by-package - temporary shim: the data tier moved to the gateway and 60 call sites must keep compiling; not copyable, count may only fall, deleted in the last slice of P2
export * from "@kmodern/api/prisma";

export * from "@kmodern/api/prisma";
