# 10: Auth, OTP and sessions, end to end

**What to build:** a shopper signs in with their phone number, receives a one-time code, signs in, browses their account and signs out — and the admin operator does the same, over one session implementation. Today the customer phone number is a unique key reached by a write path with no normalisation, so two spellings of one number can create two customers, and the storefront's logout route re-implements revocation that its own auth module does not expose.

**Blocked by:** 05, 07.

**Status:** ready-for-agent

- [ ] A shopper requests a one-time code, receives it, and signs in; the code is verified, consumed and rate-limited
- [ ] The phone number is normalised by the shared contract at every write path, so one human cannot become two customers
- [ ] The client-side input handling cannot produce a value the server's contract would reject — today it can, by truncating a number that already carries a country code
- [ ] The code is sent through the SMS provider as one gateway service; the number reaches the provider in the provider's expected format
- [ ] Session creation and session revocation are both reachable from one session implementation
- [ ] The admin panel's own authentication, including the seeded operator account, uses the same gateway session contract
- [ ] The stored customer address is normalised through the shared contract
- [ ] The storefront and the panel hold no credential material beyond what the gateway issues them
