// TEMPORARY. This package is the forwarding shim described in the adoption plan's P2: the data
// tier now belongs to the gateway, and this file keeps the ~60 existing call sites compiling while
// they are migrated one resource at a time.
//
// It exists because §5.5 says a database package does not exist, and the whole point of the
// migration is that this file does not. Nothing should import it except the two clients, and the
// audit prints this count until it is zero — at which point this package is deleted and the
// clients import the gateway directly.

export * from "@kmodern/api/prisma";
