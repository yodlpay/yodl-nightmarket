# Activity → a native wallet home

*Design research, 2026-08-05. Researched against shipped iOS apps on Mobbin.*

---

## 1. Brief

`app/(market)/activity.tsx` is the drawer beside the scanner. Today it opens with a
number that is **not the user's money** — `stats.settled` is the integration-wide
settlement total across every wallet Nightmarket has ever reconciled — captioned
"Settled through Nightmarket" and set at 56pt on the app's one inverted card. Under
it sit two tiles to hosted Yodl surfaces, then a three-cell reconciliation ledger
(Reconciled / In flight / Unclaimed) with a paragraph explaining webhook attribution,
then the payment feed. The feed rows are inert: `PaymentRow` accepts an `onPress`
that nothing passes.

The ask is to make it read like a wallet app: **spendable amount**, a way to **top
up**, and **the payments I have made — tappable, with detail behind them**.

- **Entry** — the wallet chip on the scanner (`/(market)` → `/(market)/activity`).
- **Exit** — the "Scan" pill back to the scanner; the hosted Yodl surfaces
  (`/onboard`, `/dashboard`); and two new destinations, `/(market)/top-up` and
  `/(market)/payment/[chainId]/[txHash]`.

**One thing this research cannot resolve on its own** and the build depends on:
there is no balance anywhere in this system today. `/v1/stats` returns aggregates,
`/v1/wallets/:address/payments` returns history. A "spendable amount" has to be read
from chain. Recommendation and cost are in §7.4; the decision is Q1 in §8.

---

## 2. Searches run

All `platform: "ios"` — `apps/mobile/package.json` has `expo` + `react-native`.

| # | Tool | Query (verbatim) | Args |
|---|---|---|---|
| 1 | `search_flows` | wallet app flow where the user taps add money on the balance and chooses how to top up | `limit: 3` |
| 2 | `search_flows` | tapping a transaction in a payment history list to open its detailed receipt | `limit: 3` |
| 3 | `search_screens` | crypto wallet home screen with a large balance number above a row of circular action buttons and a recent transaction list | `mode: deep, limit: 8` |
| 4 | `search_screens` | receive crypto screen showing a QR code of the wallet address with a copy address button underneath | `mode: deep, limit: 8` |
| 5 | `search_screens` | crypto transaction detail screen with amount at the top, status, network and a row linking out to the block explorer | `mode: deep, limit: 8` |

Search 4 is the reframing that matters. "Top up" in a fiat wallet (GoPay, Uber,
7-Eleven) means *pick a funding method* — bank, minimart, card. In a self-custodial
wallet it means *receive*: show the address. Searching the domain word alone would
have produced a bank-list screen this app cannot build.

---

## 3. Reference patterns

### The balance-first home

**[Base](https://mobbin.com/screens/48bc079c-d8a7-4bb9-87e8-a1097ab4fee9)** — the
closest reference in the whole set, and worth copying structurally. "Home" title
row, then `$4.68` at hero size **directly on the background, no card**, then a row of
four rounded-square tiles with sentence-case captions beneath (Deposit, Trade, Send,
Request), then day-grouped activity rows (TODAY / YESTERDAY) with title, `From
0x2f40…3b7d` beneath, and a right-aligned two-line amount stack. That is
*already* Nightmarket's row anatomy — the difference is that Base's hero is the
user's balance and the actions sit between it and the list.

**[Solflare](https://mobbin.com/screens/d81659ab-b8b3-4ebb-be4d-5c8c409f624f)** —
balance *in* a card, "BALANCE" eyebrow above `$32.80`, five circular actions below
the card. Proof the card treatment survives the change; it is the caption and the
source of the number that have to move, not the surface.

**[PayPal](https://mobbin.com/screens/a2213e0b-b2fa-403c-a551-a3cab8639bd4)** —
caption "Available value" above the number. The word doing the work is *available*.
Take the caption pattern: one short noun phrase that says whose money and what state.

**[OKX](https://mobbin.com/screens/c1bcb8cc-42fd-449c-adc0-8b25de703899)** — "Est
total value" with an eye toggle, then five actions, then an allocation breakdown.
The eye toggle is the one thing here worth *not* taking (§6).

**[Binance](https://mobbin.com/screens/1286bc99-7c7a-49cf-b10f-6fcb8985be19)** —
`$10` with a single high-contrast **Receive** button set on the same line, to the
right. The minimal form of "balance + one funding action" when there is only one.

**[MoonPay](https://mobbin.com/screens/8414cbd0-2208-45ea-b31e-433c33404d83)** —
the empty state to copy: an icon in a rounded inset box, "Nothing to see here",
"Activity will show up here when you use MoonPay". Sized like a block, not collapsed
to one line. Funding actions (Buy / Deposit) sit as pills at the foot.

**[Uber Wallet](https://mobbin.com/flows/cd3be855-0478-4e46-a1da-1a3947c85c1b)** —
Uber Cash `$0.00` on a card with **+ Add Funds** *inside the card*, under the number.
The tightest coupling of balance and top-up in the set, and the reason §4 puts the
top-up affordance adjacent to the number rather than in a generic tile row.

**[GoPay](https://mobbin.com/flows/231e4f86-393a-43b7-b230-c3a2210b0e0e)** and
**[7-Eleven](https://mobbin.com/flows/8a31fb20-e1d4-479e-9d75-6f44743fbbd4)** — the
fiat reading of "top up": a method chooser (bank / minimart / card), then an amount
keypad. Both are the wrong shape for a self-custodial wallet — there is no method to
choose and no amount to enter, because the sender decides both. Included because
the *label* "Top up" is theirs and the label is what the user asked for.

### Top up = receive

Every result converges on one layout, and the differences are all in the warning.

**[Phantom](https://mobbin.com/screens/c0b35d9a-68d9-4d0c-becb-62815fde60ba)** — the
cleanest. Presented as a sheet. "Receive" title, a **network chip** ("Solana ⌄")
directly under it, a large white rounded QR card, "Copied ✓" confirmation under the
QR, the helper line "Use to receive tokens on the Solana network only.", then two
equal buttons: **Copy address** and **Share**.

**[Coinbase Wallet](https://mobbin.com/screens/67ea184a-82aa-4783-85d5-0ba7144d44ce)** —
"Receive Bitcoin" header, QR, then the address in an **inset field row with the Copy
button inside it** — one object, not a label with a button parked nearby. Helper text
under it, Share at the foot.

**[Binance](https://mobbin.com/screens/dbd205ba-8d9b-448c-a964-d3000fdadbb0)** — the
warning stated as a warning: *"Only send Ethereum network assets to this address.
Other assets will be lost forever."* Full address wrapped across two lines rather
than truncated, copy icon inside the box.

**[PayPal](https://mobbin.com/screens/4320e80a-afa6-44dc-a9a6-317ad8a44a24)** — a
network row as a **card with a Change control**, above the QR. Useful shape for a
multi-chain wallet where the chain is switchable.

**[Family](https://mobbin.com/screens/25c3c448-7921-4198-8ca6-75622442dee0)** — a
row of supported-network chips under the QR, and a copy toast at the top of the
screen. Worth noting for a wallet that can receive on several chains at one address.

**[Glow](https://mobbin.com/screens/f752cb3f-a0e8-4b95-94f4-08ccfef9d10c)** and
**[Gemini](https://mobbin.com/screens/b479b995-b3d6-4bd2-bb29-a556058259fb)** — same
skeleton. Gemini adds "Current balance" as a row above the QR, which closes the loop
between the two screens.

### Payment detail

**[Base](https://mobbin.com/screens/42b3e7b5-3213-4952-aa21-b845623e3fea)** — back
chevron, no title. Icon pair, a **sentence headline** ("Traded $0.99908 of CBBTC for
ETH"), date beneath in muted, then hairline-separated label/value rows: Status,
Traded, Received, Transaction Hash (truncated). A single circular **Block Explorer**
action centred at the foot. The cleanest hierarchy of the five.

**[Kraken](https://mobbin.com/screens/ae576518-621e-4104-a64e-759c78fe4f95)** —
"Sent" as the nav title, token icon, `1.00 USDG` at hero size, then rows: To, Total
(with `≈$1.00` as a secondary line *under* the primary value), Status, Date, Ref ID
with a copy icon. The two-line value cell is exactly Nightmarket's invoice /
settlement pair.

**[Coinbase Wallet](https://mobbin.com/screens/b0e374b3-096a-49a9-9213-df8e46f027aa)** —
"Sent", date, a From→To card, then Transaction hash / Network fee / Total est., then
three circular actions at the foot: Send again, View asset in wallet, View on block
explorer.

**[Vipps](https://mobbin.com/flows/86758445-85a9-4a58-8085-fd72b002e33c)** — the
merchant-payment reading rather than the token-transfer reading, and therefore the
closest to what a Nightmarket payment *is*: "Payment to" nav title, merchant avatar
and full legal name, a "Paid" status chip, `1 €` hero, the memo beneath it, action
tiles (Split the cost / Share receipt), then a grouped card of reference rows: Paid
with, Date, Paid by, Transactions, Transaction #.

**[Lyft](https://mobbin.com/flows/0bf71cdc-b4a2-4f3a-b3bd-9fe0c3788b54)** — "Details"
nav title over a card of three rows (Date billed, Reference code, Payment method) and
the line item below. Proof that four rows is a legitimate detail screen; it does not
need to be exhaustive to be worth pushing.

**[OKX](https://mobbin.com/screens/041bd8cd-2428-4c1a-a8d7-c03f699cef4d)** — status
in the nav bar with a live spinner while pending. The one idea here for the
`awaiting` / `pending` row, which in this app is genuinely reachable.

---

## 4. Common denominator

The order every balance-first home in §3 converges on:

1. **Title row** — screen name, one trailing control.
2. **The user's own spendable balance**, hero size, with a short caption naming what
   it is ("Available value", "BALANCE", "Est total value"). Nothing else at hero size.
3. **Actions**, immediately under the number — a row of icon-over-caption squares or
   circles. Funding is the first or second of them, always.
4. **The list**, day-grouped, rows of `avatar · title / subtitle · right-aligned
   amount stack`, chevron on tap.
5. Anything explanatory sits **below** or behind a tap. Nothing between the number
   and the list.

Receive/top-up: `title → network identity → QR → address with copy inside it →
network warning → share`.

Detail: `back → identity → status → hero amount → date → label/value rows →
out-links at the foot`.

---

## 5. Divergences, and which side this repo takes

| Question | Apps split | Nightmarket | Why |
|---|---|---|---|
| Balance on a card or on the ground? | Base, OKX, PayPal: plain. Solflare, Uber: card. | **Card** — keep `<Card tone="inverted" lifted>` | The inverted card is the app's one signature surface, documented in `Card.tsx` and `theme.ts`. The number in it changes; the surface does not. |
| Balance caption | "Available value" / "BALANCE" / "Est total value" | **"Spendable"** | The user's own word, and the honest one — it is a spot balance, not a portfolio valuation. |
| Where does top-up live? | Uber: inside the balance card. Base/Solflare/PayPal: in the action row. | **Inside the card**, always visible (revised 2026-08-05 — was both) | The action row was cut, so Uber's placement is the only one left, and it is the better one anyway: the control sits on the number it changes. |
| ~~Action shape~~ | Circles (PayPal, Solflare, OKX) vs rounded squares (Base) | **Moot** — no action row | Was: rounded squares via `<Button variant="tile">`, since `tokens.ts` bans circles outside the CTA pill. Still the answer if a row ever returns. |
| Top-up presentation | Sheet (Phantom, Glow) vs pushed screen (Base, Coinbase, Binance, Gemini) | **Sheet** — `presentation: 'modal'` | It is a glance-and-dismiss surface. `fullScreenModal` is already spoken for by the hosted Yodl WebViews; a card sheet is visibly a different class of thing. |
| Detail presentation | Push (Base, Kraken, Coinbase) | **Push**, `animation: 'slide_from_right'` | Matches how `activity` itself enters. A record you may want to sit with is not a sheet. |
| Amount sign / colour | Base, OKX: green for received | **Achromatic** | This app only ever sends. There is no +/− axis to encode, and `PaymentRow.tsx` already argues the accessibility case at length. |
| Hide-balance eye | OKX, GoPay have one | **No** | It is persisted state and a second control in the title row for a demo with no privacy requirement. |
| Where the reconciliation ledger goes | No consumer wallet has one | **Behind the payment detail screen**, per-payment | See §6. |

---

## 6. Anti-patterns

- **A hero number that is not the user's money.** The current screen's 56pt figure is
  every wallet's settlement total, captioned as if it were a balance. No app in §3
  puts anything but *your* money at that size. This is the actual defect behind
  "more app native" — the caption is doing damage control for the wrong number.
- **Explanation above the list.** The Reconciled / In flight / Unclaimed ledger plus
  its four-line paragraph occupies the exact slot every reference uses for actions.
  It is the most interesting thing about the backend and the least interesting thing
  to someone checking whether they can afford a bowl of noodles. It belongs where the
  claim it describes actually lives — on one payment's detail screen — with the
  integration-wide roll-up staying available via **Dashboard**.
- **"Top up" rendered as a funding-method chooser.** GoPay and 7-Eleven list banks,
  minimarts and cards; this wallet has no method to offer and no amount to collect,
  because the sender decides both. Building that shell would produce a screen with
  one dead row in it.
- **A receive screen with no network warning.** Binance, Phantom, Glow, PayPal and
  Coinbase Wallet all carry one; Binance states the consequence outright. Omitting it
  on a screen that shows an address for three chains is the one genuinely costly
  omission available here.
- **A truncated address as the only copy target.** `0x12933a…2Bd4bB` cannot be typed
  back in. Show it in full, and make the copy control part of the same object
  (Coinbase Wallet, Binance) rather than a link parked beside it.
- **Two competing primary actions.** A "Top up" pill at the foot beside "Scan" gives
  the screen two `radius.full` pills. `tokens.ts` allows one. Top up is a tile.
- **A tinted status pill on the detail screen.** Kraken and Base tint theirs; this
  repo has already rejected that in `PaymentRow.tsx` and the detail screen must not
  reintroduce it one route away.

---

## 7. Spec

### 7.1 `app/(market)/activity.tsx` — rebuild the header, make rows tappable

Structure, top to bottom. Everything below the wallet card is a change of order or
a deletion; the `FlatList` + `groupByDay` machinery stays as it is.

1. **Title row** — unchanged. `Txt variant="title"` "Activity" + `Button
   variant="text"` "Sign out".

2. **Wallet card** — `<Card tone="inverted" lifted>`, colours from
   `useInvertedColors()`, same as today. Contents change:
   - Caption `Txt variant="caption"` → **"Spendable"** (was "Settled through
     Nightmarket").
   - Hero `Txt variant="amountHero"` → the wallet's own balance, e.g. `$24.10`.
     `numberOfLines={1}`, `adjustsFontSizeToFit`, `—` when unknown.
   - Under it, `Txt variant="small"` with the token and chain: **"USDC · Base"**.
   - Identity zone unchanged: "Your wallet · Base" + `Txt variant="mono"` truncated
     address.
   - `accessibilityLabel`: `"Spendable, $24.10 USDC on Base. Your wallet
     0x12933a…2Bd4bB."`

   **States inside the card:**
   - *Loading* — hero renders `—`, no spinner. The card must not reflow.
   - *No wallet yet* — hero `—`, identity line "Connecting…" (existing behaviour).
   - *Balance read failed* — hero `—`, and the sub-line becomes `Txt variant="small"`
     with `style={{ color: flipped.textMuted }}`: **"Balance unavailable"**. Not
     `tone="error"` — a failed RPC read is not a failed payment, and the card is
     inverted so `tone` would pick from the wrong palette anyway.
   - *Zero balance* — hero `$0.00`. **Not a fourth state** (revised 2026-08-05): an
     empty wallet is a read that succeeded, and the sub-line reads `USDC · Base`
     like any other successful read.

   Under the sub-line, in **all three states**, a `Button variant="quiet"` labelled
   **"Top up"** → `/(market)/top-up`, inside the card under the number it changes
   ([Uber](https://mobbin.com/flows/cd3be855-0478-4e46-a1da-1a3947c85c1b)). Always
   present, so the card is one fixed height — an earlier build showed it only at
   zero, which grew the card by 44pt at the moment the balance resolved.

3. ~~**Action tiles**~~ — **cut 2026-08-05, after the first build.** The row was
   Top up / Account / Dashboard, which is the shape §4.3 derives from every
   reference. It went because two of the three led to hosted Yodl surfaces nobody
   using this screen was going to open, and a row of three tiles where one is worth
   tapping teaches you to skip the row. Top up moved into the card (§7.1.2);
   `/onboard` and `/dashboard` stay registered and link-reachable but lose their
   door here. `IconArrowDown` was deleted with the row — see §7.5.

   The research finding this overrides is real and worth stating plainly: every
   balance-first wallet in §3 has an action row. This app has one action worth
   putting in it, and a row of one is a button.

4. **Delete `<Ledger>`** and its `useStats()` call from this screen. `stats.settled`
   is no longer the hero; `matched`/`pending`/`unmatched` move to §7.3. This removes
   the last consumer of `useStats` in the app — leave the hook in `src/api/hooks.ts`,
   it is one export and the endpoint still exists.
   Consequence: the `RefreshControl` drops `stats.refresh()` and refreshes the feed
   and the balance instead.

5. **Feed** — `<PaymentRow>` now gets `onPress`:
   ```tsx
   onPress={() => router.push({
     pathname: '/(market)/payment/[chainId]/[txHash]',
     params: { chainId: item.payment.chainId, txHash: item.payment.txHash },
   })}
   ```
   `PaymentRow` already renders `IconChevron` and the pressed fill when `onPress` is
   supplied — no change to that component.

6. **Empty state** — keep the existing copy and the `minHeight: 180` block; it
   already matches [MoonPay](https://mobbin.com/screens/8414cbd0-2208-45ea-b31e-433c33404d83).
   Copy stays: `"No payments yet. Scan a merchant code and it appears here."`

7. **Scan pill** — unchanged, foot of screen, the screen's only `radius.full`.

### 7.2 `app/(market)/top-up.tsx` — new

Sheet (`presentation: 'modal'`). Layout follows
[Phantom](https://mobbin.com/screens/c0b35d9a-68d9-4d0c-becb-62815fde60ba) with
[Binance](https://mobbin.com/screens/dbd205ba-8d9b-448c-a964-d3000fdadbb0)'s warning
and [Coinbase Wallet](https://mobbin.com/screens/67ea184a-82aa-4783-85d5-0ba7144d44ce)'s
copy-inside-the-field:

1. `Txt variant="title"` **"Top up"**.
2. `Txt variant="body" tone="secondary"` — **"Send USDC to this address on Base. It
   lands in your wallet and you can spend it here."** The chain comes from
   `BALANCE_CHAIN_ID` via `chainName()`, not from `SUPPORTED_CHAIN_IDS` — this
   screen must name the chain the balance is *counted* on, not every chain the
   wallet can *pay* on. USDC sent on Arbitrum arrives at this same address, is
   perfectly safe, and never appears in the number this screen exists to raise.
3. **QR** — `react-native-qrcode-styled` (already a dependency; the scanner is its
   only current consumer). Centred, on a `colors.surface` card at `radius.card`,
   `space.lg` padding. Encode the **bare address**, not an EIP-681 URI — the address
   scans in every wallet, the URI does not.
   - Light mode: dark modules on the card. Dark mode: the QR card stays light — a
     QR needs the quiet zone and the contrast polarity scanners expect, which is
     the one place the app deliberately does not follow the scheme.
4. **Address field** — a `Pressable` row at `radius.control` on
   `colors.surfaceSecondary`, containing `Txt variant="mono"` with the **full
   address wrapped across two lines** (`numberOfLines={2}`) and a copy affordance at
   the trailing edge. Whole row is the tap target.
   - On press: `Clipboard.setStringAsync(address)` (`expo-clipboard`, already a
     dependency) + `Haptics.notificationAsync(Success)`, and the row's trailing
     label flips to **"Copied"** for ~1.6s before reverting to "Copy".
   - `accessibilityRole="button"`, label `"Copy your wallet address"`.
5. **Warning** — `<Card>` with `Txt variant="small" tone="muted"`: **"Only send USDC
   on Base. Another network or another token will not show up here, and may be
   lost."** Both failure modes in one line: the wrong chain can lose the money, the
   wrong token on the right chain merely goes uncounted. Ranking them invites
   reading past the smaller one.
6. **Share** — `Button variant="quiet"` "Share address" → RN `Share.share({ message:
   address })`. No new dependency.
7. **Done** — `Button` (pill) at the foot, `router.back()`. The screen's one
   `radius.full`.

**States:**
- *Wallet connecting* (`address === null`) — the QR slot renders a
  `colors.skeleton` block at the QR's exact dimensions, the address row renders
  "Connecting…" in `mono` and is not pressable, Share is `disabled`. No spinner: the
  layout must not jump when the address arrives.
- *No wallet at all* (`wallet.needsWallet`) — render `<Gate>` with
  `IconAccount`, eyebrow "Top up", title "No wallet yet", body "Your wallet is
  created the first time you pay. Scan a merchant code to get one." and action
  `Button` "Back to the market" → `router.back()`. `Gate` is the app's existing
  dead-end layout and every other dead end uses it.

Register in `app/(market)/_layout.tsx`:
```tsx
<Stack.Screen name="top-up" options={{ presentation: 'modal' }} />
```

### 7.3 `app/(market)/payment/[chainId]/[txHash].tsx` — new

Pushed, `animation: 'slide_from_right'`. Following
[Vipps](https://mobbin.com/flows/86758445-85a9-4a58-8085-fd72b002e33c) for the
merchant identity and [Base](https://mobbin.com/screens/42b3e7b5-3213-4952-aa21-b845623e3fea)
for the row list:

1. **Back** — `Button variant="text"` "Back" at the top left, or a `IconChevron`
   rotated; match whatever `pay.tsx`/`dashboard.tsx` do for dismissal rather than
   introducing a header bar. No `Stack` header — `headerShown: false` is the group
   default and every screen in the app draws its own top.
2. **Identity** — the 40pt `radius.control` avatar with the merchant initial (same
   construction as `PaymentRow`), then `Txt variant="heading"` with
   `payment.recipient?.title ?? 'Unknown stall'`.
3. **Status** — `Txt variant="body"`, the word from `PaymentRow`'s `LABELS` map
   (`paid` / `in flight` / `sent` / `refunded` / `failed` …). `tone="error"` only for
   `failure` and `refund_failure`; `tone="secondary"` otherwise. **No pill, no tint.**
   Export `LABELS` from `PaymentRow.tsx` rather than duplicating the map.
4. **Hero amount** — `Txt variant="amount"` (34pt, *not* `amountHero` — §1 of
   `tokens.ts` allows one hero per screen and this screen's is this) with the
   invoice amount: `formatAmount(invoice.amount, invoice.currency)`.
   Under it, `Txt variant="mono" tone="secondary"`: `"settles to $1.72"`, or `"not
   settled yet"` in `tone="muted"` when `SETTLED` does not contain the state.
5. **Date** — `Txt variant="small" tone="muted"`, absolute not relative: the feed row
   already said "4m ago" and the detail's job is the precise value. Format with
   `Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })` inside
   the same `try/catch` fallback `dayTitle()` uses.
6. **Rows** — a `<Card>` of label/value pairs, `Txt variant="small" tone="secondary"`
   left, value right. In order:
   - **Network** — `chainName(payment.chainId)`
   - **Invoice** — `formatAmount(invoice.amount, invoice.currency)`
   - **Settled** — `formatAmount(invoice.settlementAmount, invoice.settlementCurrency)` or `—`
   - **Sent** — `intentAt`, absolute, or `—`
   - **Confirmed** — `notifiedAt`, absolute, or `—`
   - **Transaction** — `truncateHash(txHash)` in `Txt variant="mono"`, whole row
     pressable → copy full hash, same "Copied" affordance as §7.2.4.
7. **Attribution** — the ledger's idea, scoped to this one payment. `Txt
   variant="small" tone="muted"` under the card, keyed off `payment.attribution`:
   - `matched` → **"This app sent this payment and Yodl confirmed it."**
   - `pending` → **"This app sent this payment. Yodl hasn't indexed it yet."**
   - `unmatched` → **"This arrived claiming our integration address, but no
     transaction this app sent matches it."**

   This is where the deleted paragraph's information goes, and it is finally
   attached to a specific thing rather than to a counter.
8. **Out-link** — `Button variant="quiet"` **"View on block explorer"** →
   `WebBrowser.openBrowserAsync(explorerUrl(chainId, txHash))` (`expo-web-browser`,
   already a dependency). Explorer bases, new constant in `packages/shared`:
   `1 → etherscan.io`, `8453 → basescan.org`, `42161 → arbiscan.io`, each
   `/tx/${hash}`. Unknown chain → hide the button rather than guess a host.

**Data.** `routes.payment(chainId, txHash)` already exists in
`packages/shared/src/index.ts`, and `apps/api/src/routes/payments.ts:57` already
serves a bare `NightmarketPayment` (404 with `{ error: 'Not found' }` when absent).
No backend work. Add `api.payment(chainId, txHash)` to `src/api/client.ts` parsing
with `nightmarketPaymentSchema`, and `usePayment(chainId, txHash)` to
`src/api/hooks.ts` built on the existing `useResource`. **Do not add a query
library** — the reasoning at the top of `hooks.ts` still applies.

**States:**
- *Loading* — three `colors.skeleton` blocks at the heights of the title, the hero
  and the card. No spinner, per the app's existing habit.
- *Error* — `<Card>` with `Txt variant="small" tone="error">{error.message}`, plus
  the Back control. Same shape `<Ledger>` used for its error before deletion.
- *404 / unknown payment* — `<Gate>`, eyebrow "Payment", title "We don't have this
  one", body "It may not have reached the backend yet. Pull to refresh the feed and
  try again.", action "Back to activity".
- *Missing invoice* (`payment.invoice === null`, real for an `awaiting` row) — hero
  renders `—`, Invoice and Settled rows render `—`, status reads "sent". Never a
  zero.

Register:
```tsx
<Stack.Screen name="payment/[chainId]/[txHash]" options={{ animation: 'slide_from_right' }} />
```

### 7.4 The spendable balance — where the number comes from

**Recommended: read it on-device with `viem` through Privy's EIP-1193 provider.**
`viem@2.55.5` is already in `apps/mobile/package.json` and `useWallet()` already
holds the provider and the live `chainId`. No backend change, no new dependency, no
API secret anywhere near the bundle.

New file `apps/mobile/src/wallet/useBalance.ts`:

```ts
// createPublicClient({ chain, transport: custom(provider) })
//   .readContract({ address: USDC[chainId], abi: erc20Abi, functionName: 'balanceOf', args: [address] })
// → formatUnits(value, 6) → formatAmount(string, 'USD')
```

- Returns the same `Resource<T>` shape as `src/api/hooks.ts` so the card's
  loading/error handling is identical to the feed's, and refetches on focus via
  `useFocusEffect` for the same reason the feed does — the user pays inside a hosted
  WebView and comes back.
- Never parse through `number`. `formatUnits` returns a string; `formatAmount` takes
  a string. The rule in `packages/shared/src/format.ts` holds here.
- **Base only** (chain `8453`, USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`,
  Circle native issuance). Decided 2026-08-05, after the first build read all three
  supported chains. The wallet can still be switched to Ethereum or Arbitrum for a
  payment — `SUPPORTED_CHAIN_IDS` is unchanged — but the hero does not follow it
  there. Summing three chains states a total that cannot be spent in one go;
  following the current chain makes one wallet report three balances depending on
  where its last payment settled. One chain, one number.
- A wallet on any other chain yields "Balance unavailable", **not** a zero. **A zero
  balance and an unreadable one must never render the same.** Adding a chain later
  is one entry in the `USDC` map plus one in `CHAINS`.
- `BALANCE_CHAIN_ID` is exported from `useBalance.ts` and the top-up screen names it
  in copy — see §7.2.2. A screen that invites money onto a chain this hook does not
  count is the specific bug that export exists to prevent.

**Rejected: a `/v1/wallets/:address/balance` endpoint.** It is the more scalable
answer and the wrong one here — it puts an RPC dependency and a key into a backend
that currently has neither, to serve a number the device can already read.

### 7.5 ~~New icon~~ — void

`IconArrowDown` was built for the Top up tile and deleted with it on 2026-08-05.
`src/ui/Icon.tsx` is back to five glyphs. The card's Top up button is a label, not
an icon, so nothing needs a sixth. Recoverable from git if the row ever returns.

### 7.6 Files

**Create**
- `apps/mobile/app/(market)/top-up.tsx`
- `apps/mobile/app/(market)/payment/[chainId]/[txHash].tsx`
- `apps/mobile/src/wallet/useBalance.ts`

**Modify**
- `apps/mobile/app/(market)/activity.tsx` — card contents, Top up button in the
  card, delete `<Ledger>`/`useStats`/`<Destinations>`, `onPress` on rows
- `apps/mobile/app/(market)/_layout.tsx` — register two routes
- ~~`apps/mobile/src/ui/Icon.tsx`~~ — no longer touched; see §7.5
- `apps/mobile/src/ui/PaymentRow.tsx` — export `LABELS`, `SETTLED`, `FAILED`
- `apps/mobile/src/api/client.ts` — `api.payment()`
- `apps/mobile/src/api/hooks.ts` — `usePayment()`
- `packages/shared/src/format.ts` — `explorerUrl(chainId, txHash)`

**Do not touch** — `packages/theme` (every token needed exists), `apps/api`,
`Card.tsx`, `Button.tsx`, `Screen.tsx`, `Txt.tsx`, `Gate.tsx`.

### 7.7 Components and tokens to reuse

`Screen` · `Card` (`tone="inverted"`, `lifted`) · `Button` (`pill` / `tile` /
`quiet` / `text`) · `Txt` (`title`, `heading`, `amountHero`, `amount`, `amountRow`,
`body`, `bodyStrong`, `small`, `caption`, `mono`) · `PaymentRow` · `Gate` ·
`IconAccount`, `IconGrid`, `IconChevron` · `useColors`, `useInvertedColors` ·
`space`, `radius`, `typography`, `lift` from `@nightmarket/theme` ·
`formatAmount`, `truncateAddress`, `truncateHash`, `chainName`, `relativeTime` from
`@nightmarket/shared`.

No new colour, no new radius, no UI dependency. `react-native-qrcode-styled`,
`expo-clipboard`, `expo-haptics` and `expo-web-browser` are all already installed.

---

## 8. Open questions

**Q1 — Balance source. ANSWERED 2026-08-05: Base USDC only.** Read on-device with
viem per §7.4. Ethereum and Arbitrum are counted by nothing; a wallet parked on
either reads "Balance unavailable". `SUPPORTED_CHAIN_IDS` is untouched, so paying on
those chains still works — see Q6, which this answer opens.

**Q2 — The stats screen.** §7.1 deletes the Reconciled / In flight / Unclaimed
ledger and moves its meaning to per-payment attribution (§7.3.7). That removes the
integration-wide roll-up from the app entirely. Acceptable for the demo, or should
it survive somewhere — a row inside the Dashboard tile, its own screen behind a
long-press, kept but moved below the feed?

**Q3 — Top up copy.** "Top up" is the user's word and matches Uber/GoPay, but every
crypto reference in §3 says "Receive". The tile can say Top up while the screen says
Receive, or both can say one. Recommendation: **Top up** in both — the audience for
this demo is not assumed to be crypto-fluent, and "Receive" next to a payments feed
reads as incoming payments.

**Q4 — Detail screen for `unmatched`.** `/v1/wallets/:address/payments` returns only
this wallet's `matched` and `pending` rows, so an `unmatched` payment is not reachable
from the feed — but §7.3.7 writes copy for it. Keep the branch as
defence-in-depth for a deep link, or drop it?

**Q5 — Refresh.** Should the balance refetch after the hosted payment WebView
dismisses (an explicit refresh on focus, which `useFocusEffect` already gives), or
also poll while a `pending` row is in the feed? Polling is the more correct demo and
the more code; the recommendation is focus-only.

**Q6 — Should the *wallet* be Base-only too?** Opened by Q1's answer.
`SUPPORTED_CHAIN_IDS` in `src/yodl/sdk.ts` is still `[1, 8453, 42161]`, so a payment
can leave the wallet on Arbitrum, at which point the hero reads "Balance unavailable"
until the user switches back. Three ways out, none free: (a) leave it — the demo
shows a real multi-chain wallet and an honest refusal to guess; (b) narrow
`SUPPORTED_CHAIN_IDS` to `[8453]`, which changes payment routing and has to stay in
sync with Privy's `supportedChains`; (c) keep the chains and have the card offer
"Switch to Base" when the wallet is elsewhere. **Not built** — (b) is a payments
decision rather than a design one, and (c) is a screen this doc never specified.
