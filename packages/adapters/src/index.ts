// TEMPORARY, and this package is now only this file.
//
// The four adapters moved into the gateway, beside the rules that use them: `storage/` for S3 and the
// local fallback, `payments/` for the card-to-card gateway, `sms/` for the OTP provider, `shipping/`
// for the courier quote. That is where ADR-0003 §3 puts infrastructure — a rule and the code that
// applies it belong in the same process, and an adapter package is a rule that has to be imported into
// whatever needs it, which is how a payment rule ends up applied at three different strengths.
//
// What is left here is forwarding, for the panel's two consumers: `apps/admin/src/lib/media.ts` and
// `apps/admin/src/lib/scraper-images.ts`. Both reach for a `Storage` directly, and the panel should
// not have one — an operator's upload is a write to the shop's media, and the gateway is where that
// write belongs. Until the panel's media routes ask the gateway for its list and its uploads, this
// file is what keeps them compiling, and it is a forwarding shim of the same kind `packages/db` is.
//
// The step that removes it: give `apps/api/src/media` a `GET /media` and a `POST /media`, move the
// local-filesystem fallback and the key generation across with the safe-key rule already there, and
// point the panel's two route handlers at the gateway. Then this package has no consumer and is
// deleted rather than emptied.

export {
  storageConfigFromEnv,
  createStorage,
  type StorageConfig,
  type Storage,
  type UploadInput,
} from "@kmodern/api/storage";
export {
  zarinpalConfigFromEnv,
  requestPayment,
  verifyPayment,
  type ZarinpalConfig,
  type PaymentRequest,
  type PaymentRequestResult,
  type VerifyResult,
} from "@kmodern/api/payments";
export {
  kavenegarConfigFromEnv,
  sendLookup,
  type KavenegarConfig,
  type LookupParams,
  type TemplateName,
} from "@kmodern/api/sms";
export {
  postexConfigFromEnv,
  fetchQuotes,
  type PostexConfig,
  type QuoteRequest,
  type QuoteResult,
} from "@kmodern/api/shipping";
