import { zarinpalConfigFromEnv } from "@kmodern/adapters";
import { getSetting } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema/setting-keys";
import CheckoutClient from "./checkout-client";

export const dynamic = "force-dynamic";

// Payment options are gated server-side: only methods that can actually
// complete are offered (issue: offered-but-dead options trapped customers).
export default async function CheckoutPage() {
  const [c2cCard] = await Promise.all([
    getSetting<string>(settingKeys.paymentC2cCardNumber),
  ]);
  const onlineEnabled = !!zarinpalConfigFromEnv();
  const c2cConfigured = !!c2cCard?.trim();
  return <CheckoutClient onlineEnabled={onlineEnabled} c2cConfigured={c2cConfigured} />;
}
