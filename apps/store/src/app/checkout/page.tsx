import { publicSettings } from "@/lib/settings";
import CheckoutClient from "@/checkout/components/checkout-client";

export const dynamic = "force-dynamic";

// Which payment methods to offer is a question about the shop's configuration, and the answer lives in
// the one process that holds the configuration. This page used to ask it of its own environment: read
// the online provider's credentials, and offer the method if they parse. That put a merchant credential
// in the storefront for a yes/no answer, and left the two processes free to disagree — the storefront
// offering a method the gateway cannot complete, which is the failure this whole move exists to remove.
//
// Both flags are now computed by the gateway from the configuration it already has. Computing rather
// than storing is the point: a stored flag is a thing an operator can forget to update, and a checkout
// page offering a dead payment method traps the shopper on it.
export default async function CheckoutPage() {
  const settings = await publicSettings();

  return (
    <CheckoutClient
      onlineEnabled={settings.onlinePaymentEnabled === true}
      c2cConfigured={settings.c2cPaymentConfigured === true}
      c2cDetails={{
        cardNumber: (settings.paymentC2cCardNumber as string) || "6063731100802066",
        iban: (settings.paymentC2cIban as string) || "IR570600561170009820151001",
        cardHolder: (settings.paymentC2cCardHolder as string) || "خانه مدرن",
        bankName: (settings.paymentC2cBankName as string) || "بانک مهر ایران",
      }}
    />
  );
}
