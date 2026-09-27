// The panel's gateway client.
//
// The panel had no client at all: 37 files imported the data tier directly, including every page and
// every server action, so the panel was a second application with its own idea of the rules rather
// than a caller of the one that holds them. This module is what replaces that — the same transport the
// storefront uses, configured for the panel's identity.
//
// One difference from the storefront's client, and it is the difference §10 calls the one legitimate
// duplication: this is server-side only. Every action here is a server action, so the credential is the
// operator's cookie read off the incoming request, not something in browser storage. There is no
// browser client in the panel and there should not be one — an operator's session cookie must never be
// reachable from JavaScript, and a `createBrowserApiClient` call would be one refactor away from that.
//
// The result helper is the other half of the shape. A gateway failure arrives as a `GatewayError` whose
// `statusCode` is the server's own decision, and the panel's actions used to each decide what that
// meant — six of them returned the generic "try again" for a 409 the server had already explained.
// `fromGateway` reads the envelope's Persian message, because the server knows why it refused and the
// panel does not.

import { GatewayError, type ApiClient } from "@kmodern/transport/client";
import { ADMIN_COOKIE, createServerApiClient, gatewayBaseUrl } from "@kmodern/transport/next";
import { failed, succeeded, type ActionResult } from "./actions/result";

export { GatewayError };

/**
 * A client bound to the operator's session.
 *
 * Built per call, never held in a module variable: the credential is a cookie, and a client built once
 * at import time would capture whichever request happened to arrive first — which outlives the session
 * it belonged to.
 */
export async function panelGateway(): Promise<ApiClient> {
  return createServerApiClient({ baseUrl: gatewayBaseUrl(), tokenName: ADMIN_COOKIE });
}

/**
 * Run a gateway call as an action result.
 *
 * The `message` is what the operator sees on success. The `unreachable` case is separated from the
 * `failed` one because they are different faults with different responses: a gateway that is down is
 * worth retrying, and an operator told "try again" for an unreachable gateway is right; an operator
 * told "try again" for a 400 is not, and the server's own message is on the table precisely because it
 * says which.
 */
export async function fromGateway<T>(
  call: (client: ApiClient) => Promise<T>,
  message: string,
): Promise<ActionResult<T>> {
  let client: ApiClient;
  try {
    client = await panelGateway();
  } catch (error) {
    // A build whose address was never configured. A failure rather than a success, because the form
    // must not report that a change was saved when nothing was sent — and its message names the
    // variable, because no retry fixes this and the reader would otherwise go looking at the gateway.
    return failed(describe(error));
  }

  try {
    const data = await call(client);
    return succeeded(message, data);
  } catch (error) {
    return failed(describe(error));
  }
}

/** The server's own message, or a sentence naming which fault this was. */
function describe(error: unknown): string {
  if (!(error instanceof GatewayError)) {
    return "خطای ناشناخته؛ دوباره تلاش کنید";
  }
  if (error.misconfigured) return error.message;
  if (error.unreachable) {
    return `درگاه در دسترس نیست؛ دوباره تلاش کنید (${error.message})`;
  }
  return error.message;
}
