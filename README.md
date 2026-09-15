# Nightmarket

A demo of the [Yodl](https://docs.yodl.me) React Native SDK: scan a merchant QR
anywhere Yodl is live, pay with whatever token you happen to be holding, and watch
the payment turn up in your own backend's ledger seconds later.

It is a pnpm monorepo with two applications:

| | |
| --- | --- |
| **`apps/mobile`** | Expo (SDK 57) scanner — opens straight onto a viewfinder, Openfort embedded wallet, the three Yodl hosted surfaces |
| **`apps/api`** | Hono REST API — receives Yodl's signed payment webhooks, reconciles them, serves the app's feed |

and two shared packages:

| | |
| --- | --- |
| **`packages/theme`** | The Nightmarket design system — one palette, used for the app chrome *and* handed to Yodl's hosted UI |
| **`packages/shared`** | The contract between the two apps: Zod schemas for Yodl's payloads, the API's response shapes, formatters |

---

## The app is the scanner

After sign-in the app opens directly onto a live viewfinder. There is no home
screen behind it — Nightmarket is a thing you hold up to a printed code, and every
tap between launch and a live camera is a tap spent in front of someone waiting to
be paid.

```
sign-in ──▶ (market)/index ──scan──▶ pay ──success──▶ back to the scanner
              │  the camera            YodlPayment
              │
              ├─ wallet chip ─▶ activity   wallet · ledger · history · sign out
              ├─ ◎ ───────────▶ onboard    YodlSignup
              └─ ▤ ───────────▶ dashboard  YodlDashboard
```

Everything else hangs off that one screen and returns to it:

- **Torch**, because the markets this targets are open after dark.
- **Scan from an image** (`scanFromURLAsync`) — merchant codes circulate as
  screenshots, and a scanner that can only see through the lens sends the user off
  to print something.
- **Rejections are loud.** A camera that silently ignores a QR is
  indistinguishable from one that isn't focusing, so a non-Yodl code says so and
  re-arms after a beat.
- **The camera unmounts on blur.** Expo Router keeps the screen mounted under the
  payment WebView; without that it would keep running — and holding the OS camera
  indicator on — while the user enters an amount.

---

## The idea worth stealing

Most payment-SDK demos stop at "the payment succeeded". This one goes one step
further, because the Yodl docs contain a warning that is easy to read past:

> A payment's integration address is written into its on-chain metadata by whoever
> builds the payment, so **anyone can claim yours**. A notification means some
> payment *claimed* your integration address. It does not mean the payment came
> from your app.

So a signed webhook is authentic — the HMAC proves Yodl sent it — and still not
proof of your sale. Reconciling it requires a second, independent record of what
your own app actually did.

Nightmarket keeps one. The moment `<YodlPayment>` fires `onTransactionSent`, the
app posts the hash to its own backend as an **intent**. When the webhook for that
hash arrives, the API joins the two on `chainId:txHash`:

```
intent + delivery  →  matched      your user, your payment — safe to show
intent alone       →  pending      sent, not yet indexed by Yodl
delivery alone     →  unmatched    someone else naming your integration — noise
```

The app's activity feed reads `matched` only. `unmatched` is kept, counted, and
shown on the home screen, because a number that only appears once something has
gone wrong teaches nobody what it means.

---

## Running it

### 0. Prerequisites

- Node ≥ 22, pnpm ≥ 10
- An [Openfort](https://dashboard.openfort.io) project with **Email** enabled under
  Configuration → Providers, and a set of **Shield** keys from
  [the API keys page](https://dashboard.openfort.io/api-keys) — sign-in and the
  wallet are two separate pieces of setup, and the second is what gives a signed-in
  user an address
- A Yodl integration address ([how to get one](https://docs.yodl.me/integrations/onboarding))
- **Android:** Android Studio, a JDK (17 works), and an emulator or device.
  Set `ANDROID_HOME` — the Gradle wrapper is vendored, so a separate Gradle isn't needed.
- **iOS:** Xcode, and therefore macOS. `expo run:ios` has no Linux or Windows path;
  on those, Android is the only local target.

> **Expo Go will not work.** The Yodl SDK renders its hosted UI in
> `react-native-webview` and Openfort pulls in native modules of its own (secure
> store, crypto, passkeys); none of that exists in Expo Go, which produces a crash
> or a blank screen rather than a useful error. You need a development build —
> `expo run:ios` / `expo run:android` below do that for you.

### 1. Install

```bash
pnpm install
```

### 2. Configure

```bash
pnpm run setup:env
```

There is **one** `.env.example`, at the repo root, split into per-app sections by
`# ==>` markers. The script turns it into `apps/api/.env` and
`apps/mobile/.env` — comments and all — and fills in everything a machine can work
out:

- an **Ed25519 attestation keypair**, base64-encoded onto one line
- your **LAN address** in `EXPO_PUBLIC_API_URL`, since `localhost` on a phone is
  the phone
- the **integration address**, propagated to both files — if those two disagree,
  every webhook is rejected as addressed elsewhere and no payment ever reaches the
  feed
- the two **Openfort publishable keys**, propagated the same way once you have
  supplied them — if those disagree between the files, the API resolves the app's
  access tokens against the wrong project, and both the OTP skip and wallet
  recovery stop working without saying why

Re-running is safe and useful: it never overwrites a value you typed, and it
**adopts keys added to the example since you set up** — appending them with their
comments rather than leaving you to discover the omission at boot. That is what
makes a single example worth keeping in step with, and it's why the two apps don't
carry `.env.example` files of their own; one integration address documented in two
places is one that drifts.

It then prints what's left, which is:

| | |
| --- | --- |
| `EXPO_PUBLIC_OPENFORT_PUBLISHABLE_KEY`, `EXPO_PUBLIC_OPENFORT_SHIELD_PUBLISHABLE_KEY` | [dashboard.openfort.io/api-keys](https://dashboard.openfort.io/api-keys). You need both — the publishable key names the project people sign in to, the Shield key is what gives them a wallet once they are in. Both are public identifiers, and `setup:env` copies them over to the API |
| `OPENFORT_SHIELD_SECRET_KEY`, `OPENFORT_SHIELD_ENCRYPTION_SHARE` | same page, server-side only — together they decrypt every wallet in the project, and the encryption share is shown **once**. Without them `/v1/openfort/encryption-session` answers 501, no wallet can be created or recovered, and there is nothing to pay with |
| `YODL_INTEGRATION_ADDRESS` | defaults to the sample address from Yodl's docs so the local webhook replay works; replace it in **both** files with yours |
| `YODL_API_SECRET` | optional — without it `/v1/yodl/payments` returns 501 and everything else works |

> `pnpm setup` (no `:env`) is a **built-in pnpm command** that edits your shell
> profile. Use `pnpm run setup:env`.

### 3. Run

**Terminal 1 — the backend.** It binds `0.0.0.0`, not localhost, because the thing
that talks to it is a phone.

```bash
pnpm dev:api        # http://localhost:8787
```

**Terminal 2 — the app.** The first run compiles a native dev client and installs
it; expect several minutes and a lot of Gradle. Later runs reuse it.

```bash
pnpm --filter @nightmarket/mobile android    # or: ios, on macOS
```

That command also starts Metro. Once the client is installed, `pnpm dev:mobile`
is enough on its own — you only need `run:android` again after changing something
native (a config plugin, a permission, a new package with native code).

The API seeds itself with a few night-market stalls on first boot
(`NIGHTMARKET_SEED=1`), so the feed has something in it before a real payment ever
happens.

If the app can't reach the API, it says so on screen with the URL it tried. On an
emulator `10.0.2.2` is the host's localhost; on a physical device you need the LAN
address `setup:env` wrote, and the host firewall has to allow the port.

---

## Exercising the backend without a payment

Yodl signs the real deliveries. `send-webhook.ts` signs a fake one with the same
secret, so the whole path — signature, version gate, reconciliation — can be run
without a tunnel:

```bash
cd apps/api

# A delivery nobody claimed → lands as `unmatched`
pnpm exec tsx scripts/send-webhook.ts

# Claim it, as the app would on onTransactionSent → upgrades to `matched`
curl -X POST localhost:8787/v1/intents -H 'content-type: application/json' \
  -d '{"chainId":"8453","txHash":"0xabab…","wallet":"0x…c0de"}'

# Replay the same version → dropped, and still answered 200
pnpm exec tsx scripts/send-webhook.ts 0xabab… success 1

curl -s localhost:8787/v1/stats
```

Answering `200` to a replay is deliberate: Yodl records any non-2xx as a delivery
failure, and a duplicate is not a failure — we already knew.

---

## What each piece is doing

### The webhook (`apps/api/src/routes/webhook.ts`)

Five gates, in an order that is not arbitrary:

1. **Read the raw body first**, before anything parses it. The signature covers the
   exact bytes that arrived, and `JSON.stringify(parsed)` is not those bytes — key
   order alone is enough to break it.
2. **Route by `X-Yodl-Integration`, don't trust it.** It exists so an endpoint
   serving several integrations can select the right signing secret *before*
   verifying. It is an unauthenticated hint.
3. **Verify** — HMAC-SHA256 over `"<t>.<raw body>"`, compared in constant time,
   inside a freshness window. All three matter: without constant time the signature
   is recoverable byte by byte, and without the window a captured delivery replays
   forever.
4. **Then parse.**
5. **Then version-gate.** Deliveries are unordered and repeat; a snapshot is applied
   only if its `version` is strictly greater than the stored one.

The verifier is pinned against [the worked example in the Yodl
docs](https://docs.yodl.me/integrations/notifications#worked-example) rather than
against itself — a round-trip test would pass just as happily with the wrong
signed-string construction on both ends.

```bash
pnpm test     # 35 tests
```

### The theme (`packages/theme`)

One palette, two consumers. The React Native chrome reads it directly; the hosted
Yodl UI — which lives in a WebView the app cannot style — gets the same values as a
[`YodlTheme`](https://docs.yodl.me/sdk/react-native/theming). The handoff from the
scan screen into Yodl's payment screen shouldn't look like a handoff.

Note what `packages/theme/src/yodl.ts` does *not* set: `brandText`, `brandButton`
and `brandButtonText`. The hosted runtime derives all three from `brandSurface` by
contrast, and overriding them by hand can only lower the contrast it would have
picked.

### The wallet bridge (`apps/mobile/src/wallet/useWallet.ts`)

Yodl wants a provider, an address and a chain id, and is emphatic that the last two
must be *live* values — it pushes `accountsChanged` and `chainChanged` into the
hosted UI as they change, so a stale `chainId` leaves the payment on the wrong
chain. Openfort hands over the provider and the address only once its wallet state
reaches `connected`, and the chain id only over RPC, so this hook is the glue,
subscribing to the provider's own events rather than polling.

Nobody creates a wallet by hand. The wallet is an Openfort **embedded EOA**, and
`useWallet` provisions it on the first sign-in of a session: create one, or recover
the existing one when the same account signs in on a second device. A full-screen
"Create my wallet" gate is a step with no decision in it, so there isn't one.

Recovery is **automatic**, which is what lets that be true — there is no password
or passphrase for the user to invent and then need again a year later. Shield holds
the encrypted half of the key material and releases it only against a single-use
encryption session, and `POST /v1/openfort/encryption-session` is where that session
is minted. The Shield secret and the encryption share stay on the server; the device
receives one session id and spends it on one recovery.

### Email attestation (`apps/api/src/lib/attestation.ts`)

Optional, and off until Yodl enables it per integration. The user's email has
already been verified once to get this far (an Openfort email sign-in is how they
did it), so our backend mints a short-lived Ed25519 JWT asserting that and the user
skips Yodl's own OTP.

`pnpm run setup:env` generates the keypair; `pnpm --filter @nightmarket/api keygen`
rotates it. The key lives in `.env` as base64 rather than as an escaped PEM,
because Node's `--env-file` parser leaves `\n` as a literal backslash-n and the
resulting key fails to import with a message about ASN.1 rather than about
quoting.

`sub` is the **wallet**, not the email — that is what makes the token a binding
rather than two loose attributes, and it is the part people get wrong first.

The email is not the app's to propose. The mobile client posts a wallet address and
an `Authorization: Bearer <Openfort access token>` header and nothing else;
`apps/api/src/lib/openfort.ts` hands that token straight back to Openfort's
`get-session` endpoint along with the project's publishable key, and the reply
carries both the user and whether Openfort has verified their email. There is no
offline check to do: a v2 access token is an opaque HMAC string rather than a JWT,
so Openfort is the only party that can say whose it is. Signing an email the client
sent would let any caller assert any address for any wallet and skip the very OTP
this is bypassing, so there is no code path that can — the request schema does not
name an email and the resolver has no parameter to receive one.

`OPENFORT_PUBLISHABLE_KEY` is what makes that possible. Unset, the route declines
every request with a 404, which the SDK reads as "no attestation available" and the
user takes the ordinary OTP. So does a user who signed in with Google, Apple or a
passkey and has no verified email — `null` is a first-class outcome here, not a
failure. So does an api.openfort.io that is unreachable, which is the standing cost
of the round trip the opaque token forces.

---

## Layout

```
.env.example    the only one — setup:env splits it into apps/*/.env
scripts/
  setup-env.mjs seeds both .env files from it; safe to re-run
apps/
  api/          Hono · webhook receiver, reconciliation, feed, attestation signer
    src/lib/    signature.ts  store.ts  decimal.ts  attestation.ts  yodl-client.ts
    scripts/    send-webhook.ts  generate-keypair.ts
    test/       43 tests, incl. Yodl's pinned signature vector
  mobile/       Expo · expo-router
    app/        _layout  index  sign-in
                (market)/index      ← the scanner; the app
                (market)/pay        ← YodlPayment
                (market)/activity   ← wallet · ledger · history · sign out
                (market)/{onboard,dashboard}
    src/        ui/  api/  wallet/  yodl/
    scripts/    make-icons.py — the app icon, as geometry rather than a binary
packages/
  theme/        palette · tokens · the YodlTheme built from them
  shared/       Yodl payload schemas · API contract · formatters
```

## Commands

| | |
| --- | --- |
| `pnpm run setup:env` | create and fill both `.env` files; safe to re-run |
| `pnpm dev` | everything, via Turbo |
| `pnpm dev:api` / `pnpm dev:mobile` | one at a time |
| `pnpm typecheck` | all four workspaces |
| `pnpm test` | API test suite |
| `pnpm lint` / `pnpm format` | Biome |

---

## A few decisions, and why

**Amounts are strings, everywhere.** Yodl sends them as strings and the docs say
plainly not to parse them into a float and back. A VND invoice is routinely seven
digits. `apps/api/src/lib/decimal.ts` sums them through viem's
`parseUnits`/`formatUnits` on a scale taken from the widest fraction present, so
nothing rounds on the way in and nothing is a float on the way out.

**viem is the vocabulary for anything on-chain, in all three workspaces.** Not
just the balance read it was originally added for: chain names and explorer URLs
come from `viem/chains` (`packages/shared/src/chains.ts`) rather than two tables
kept by hand, `isAddress`/`isHash` validate what the API accepts, `isAddressEqual`
is how a wallet's feed is matched, `getAddress` is what checksums an address
before it is shown or sent to, and `hexToNumber` reads the `eth_chainId` reply.

The list of supported chains lives in `@nightmarket/shared` and is viem's chain
records, which is what feeds both `OpenfortProvider`'s `supportedChains` and the
Yodl SDK's `supportedChainIds`. Those were two separate literals with a comment on
each asking the reader to keep them in sync; a disagreement is a payment that dies
at the chain-switch step.

**TanStack Query owns every read in the app.** The feed, one payment, the stats
endpoint and the on-chain balance all go through it — there is no second loading
machine anywhere. It replaced a hand-rolled `useResource` (four pieces of state, a
three-mode loader, a rule about which failures may blank a screen), which two
files had to share a type to keep from drifting apart.

Each read is one hook — `useFeed`, `usePayment`, `useBalance` — sitting next to
the function it calls, with its key and its query function written together in the
options object. No wrapper: `useQuery` and `useInfiniteQuery` are called directly.

`staleTime` is zero, deliberately: every number here is money that can change
while the user is looking away, and the cached value's job is to stay on screen
*during* a refetch rather than to save one. Reads are never retried — `request()`
already spends a 10s timeout, and the payment detail screen reads a 404 as an
answer rather than as a fault.

**Nothing refetches on screen focus.** There was a `useRefreshOnFocus` wrapped
around every read, and it needed two rules nobody could infer from the call site:
skip the first focus (it coincides with mount, where the query is already
fetching) and honour `enabled` by hand, because `refetch()` doesn't — a
disconnected wallet asked for `/v1/wallets/undefined/payments` on every focus.
Both were bugs found after the fact, which is what a hand-rolled refetch policy
costs. What keeps screens current instead: mount (`staleTime` 0, and most
navigation here is a mount), `AppState` → `focusManager` for app foreground,
pull-to-refresh, and `invalidateWalletData()` at the two moments the app knows
the server changed — an intent recorded, and a watched payment reaching a state
it will never leave. Invalidation refetches precisely when there is something
new, rather than on every navigation in case there might be.

**`node-linker=hoisted`.** Metro does not follow pnpm's default symlinked layout
reliably. `.npmrc` and `metro.config.js` are two halves of the same decision.

**`browser` is an active Metro condition.** Packages in the wallet stack ship Node
and browser builds behind one exports map, usually offering `browser` before
`import`. Without `browser` active Metro takes the *Node* build, which imports
`crypto` and fails to bundle several layers away from anything this app wrote.
`jose` is the package that taught us this, and Openfort's Metro guidance still
special-cases it for the same reason; naming the condition once covers every
package that ships a browser build.

**`packages/*` ship TypeScript source, no build step.** Metro hot-reloads a palette
edit straight into the running app. The one place that costs something is
`app.config.ts`, which Node loads directly and which therefore keeps two hex values
written by hand — both for native surfaces painted before any JavaScript runs.

---

## Reference

- [Yodl React Native SDK](https://docs.yodl.me/sdk/react-native/) · [quickstart](https://docs.yodl.me/sdk/react-native/quickstart) · [theming](https://docs.yodl.me/sdk/react-native/theming) · [troubleshooting](https://docs.yodl.me/sdk/react-native/troubleshooting)
- [Payment notifications](https://docs.yodl.me/integrations/notifications) · [Payments API](https://docs.yodl.me/integrations/payments-api) · [Email attestation](https://docs.yodl.me/integrations/email-attestation)
- [Openfort embedded wallets in React Native](https://www.openfort.io/docs/products/embedded-wallet/react-native/) · [Expo monorepos](https://docs.expo.dev/guides/monorepos/)
