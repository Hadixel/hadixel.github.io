// The panel's server-side reads.
//
// This is the one duplication ADR-0003 §10 names as legitimate, and it is here rather than scattered
// because of what it is: an operator's session cookie must never be reachable from browser JavaScript,
// so there is deliberately no browser client in the panel, and every server component that needs a row
// has to build one. Nineteen page components doing that themselves is nineteen places for the base URL,
// the cookie name and the error shape to drift.
//
// The shape here is deliberately narrow. A read either answers with the data or throws, and a page that
// cannot render is a page whose error boundary runs — a *silent* empty list is how a misconfigured
// gateway turns into a panel that looks like an empty shop, and an operator who then saves what is on
// screen writes over a shop they never saw.

import { GatewayError, panelGateway } from "@/lib/gateway";

/**
 * One gateway read.
 *
 * Server-side only, and the throw is the point: a page that cannot reach the gateway must fail loudly
 * rather than render an empty table that reads as "this shop has no products".
 */
export async function readThrough<T>(path: string): Promise<T> {
  let client;
  try {
    client = await panelGateway();
  } catch (error) {
    // A build whose address was never configured. Named rather than summarised, because no retry fixes
    // this and the message is the only thing that tells an operator where to look.
    throw new Error(describe(error), { cause: error });
  }

  try {
    return await client.get<T>(path);
  } catch (error) {
    // The `cause` is what the sentence above is for: the panel needs a phrase it can show an operator,
    // and the gateway's own failure is what a developer needs in a stack trace. Dropping it turns every
    // failure into one line with nothing under it.
    throw new Error(describe(error), { cause: error });
  }
}

/** The server's own Persian sentence, or one naming which fault this was. */
function describe(error: unknown): string {
  if (!(error instanceof GatewayError)) return "خطای ناشناخته؛ دوباره تلاش کنید";
  if (error.misconfigured) return error.message;
  if (error.unreachable) return `درگاه در دسترس نیست؛ دوباره تلاش کنید (${error.message})`;
  return error.message;
}
