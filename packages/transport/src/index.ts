// The gateway's transport, for the clients.
//
// `createApiClient` is the whole of it, and it is deliberately one factory with two entry points rather
// than two factories. The split the blueprint sanctions is between a browser caller and a server-side
// caller — they read the credential from different places — and that split is visible in one file
// rather than spread across the two apps as fourteen hand-written fetches.
//
// The Next adapter is NOT re-exported here. It reaches for `next/headers`, and a package that pulls a
// framework in through its front door is a package that cannot be used outside that framework. Import
// it by name from `@kmodern/transport/next`, which makes "this client is a Next client" something the
// import statement says out loud.

export {
  createApiClient,
  GatewayError,
  DEFAULT_TIMEOUT_MS,
  type ApiClient,
  type ApiClientConfig,
  type RequestOptions,
} from "./client";
