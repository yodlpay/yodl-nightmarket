# Scanner redesign — `(market)/index.tsx`

Research date: 2026-08-05 · Platform searched: Mobbin `ios` · 6 searches

---

## 1. Brief

The scanner is the app's launch surface. A user opens Nightmarket already standing in
front of a stall, raises the phone at a printed Yodl QR, and the screen's only job is to
get a valid code decoded and pushed to `/(market)/pay` before the merchant loses
patience. There is no home screen behind it. Entry: cold launch, or return from
`/(market)/pay` / `/(market)/activity`. Exit: `/(market)/pay` on an accepted code (push,
with `qr` param), `/(market)/activity` via the wallet strip.

Two gates replace the camera entirely rather than layering on it: `NeedsWallet`
(no Privy embedded wallet yet) and `NeedsCamera` (permission not granted, in its
`canAskAgain` / blocked variants). Both are already built on `<Gate>` and are **out of
scope** for this redesign except where noted.

The redesign is not a rebuild. The current screen is a deliberate, documented design;
this doc keeps its skeleton — dimmed feed, undimmed window, QR finder-pattern marks,
chrome tiles, wallet strip pinned to the foot — and changes five specific things the
research contradicts or the screenshot exposes.

---

## 2. Searches run

| # | Tool | Query (verbatim) | Platform | Params |
|---|---|---|---|---|
| 1 | `search_flows` | scanning a merchant QR code with the camera to send a payment | ios | limit 3 |
| 2 | `search_screens` | camera viewfinder scanning a QR code with a framing window and flashlight toggle | ios | deep, limit 8 |
| 3 | `search_screens` | wallet scan tab with a segmented switch between scanning a code and showing my own code | ios | deep, limit 8 |
| 4 | `search_screens` | scanner screen showing which account or balance the payment will come from at the bottom | ios | deep, limit 8 |
| 5 | `search_flows` | crypto wallet send flow starting at a camera scan and ending at a confirmation screen | ios | limit 3 |
| 6 | `search_screens` | camera scanner showing an error message that the code could not be recognised | ios | deep, limit 6 |

Coverage is good on the viewfinder itself and on the peer-action question. It is thin on
one thing: **no reference in these results shows a scanner whose bottom strip carries a
live balance.** Setel (#4) is the closest and it is a show-my-code screen, not a
viewfinder. The balance recommendation in §5 rests on one adjacent reference, not on
convergence — treat it as the weakest claim in this doc.

---

## 3. Reference patterns

### 3.1 Family — Scan a QR Code (idle + error) — the closest analogue

[idle](https://mobbin.com/screens/1911a1ae-af34-4685-87b4-a652fc0f4e36) ·
[error](https://mobbin.com/screens/9cd98925-8b90-4d2d-9e1f-2fb3cf6ff26c)

```
Screen: Family — Scan
├ Chrome row (fixed, top)
│ ├ Torch — bare white glyph, no tile, ~22px, left gutter    [tap → torch]
│ └ Receive ⬇ — circular tile ~34px, rgba(255,255,255,0.15) fill, right
├ Frame — centered horizontally, sits at ~28% of viewport height
│ │        ~200pt square, ground is pure black (no camera visible in capture)
│ ├ 4 corner brackets — L-shaped, ~6pt stroke, ~24pt radius on the elbow,
│ │                     white, arms ~44pt long, inset 0 (they ARE the corners)
│ └ "Scan a QR Code" — 16px medium, white, dead centre INSIDE the frame
├ Helper — 2 lines, 15px regular, white ~0.85, centred, ~28pt below frame
│          "Scan an Ethereum wallet address / or connect to a desktop app"
├ Segmented — capsule ~190pt wide × 36pt, rgba(255,255,255,0.12) track,
│             active segment lighter fill + white label, inactive ~0.45 label
│             "Scan" | "My Code"                       [tap → swap surface]
└ Wallet sheet (fixed, bottom, peeking ~90pt)
  ├ grab handle
  └ avatar 32pt + "Sam's" 20px semibold + ⋯ + 💬 + ⛶ icons
```

**Error variant — the single most useful screen in this research.** Three things change
at once and nothing moves:

- the four corner brackets repaint coral `#FF5A5A`-ish (measured off the capture);
- **the window interior fills with a dark red wash** — the whole frame region goes from
  black to a desaturated maroon, so the change is visible at the aim point;
- a red line `"Unrecognized QR code"` is inserted directly above the standing helper,
  which itself is unchanged.

**Hierarchy.** Frame first (it is the only bright geometry), then the label inside it,
then the helper, then the segmented control, then the wallet sheet. The torch is the
least prominent thing on the screen — a bare glyph with no tile.

**Copy.** "Scan a QR Code" · "Scan an Ethereum wallet address or connect to a desktop
app" · "Scan" / "My Code" · "Unrecognized QR code"

**Behavior.** Torch toggles. Receive tile opens the receive surface. Segmented control
swaps scan ↔ own code in place. Wallet sheet expands.

**Context.** Sits above the persistent wallet sheet that is the app's home. Scanning an
address leads into the Send flow (see 3.7).

**Verdict — take.** The error treatment is directly transferable and better than what
Nightmarket ships. Take the window wash and the caption-in-place. Leave the segmented
control (Nightmarket has no receive surface — see §5.1). Leave the bare-glyph torch:
Nightmarket's feed is live video, and a glyph with no tile disappears over a bright
subject, which is the exact bug §5.4 fixes.

---

### 3.2 Revolut — Scan code to pay

[screen](https://mobbin.com/screens/d8069a9b-9153-4c84-b1e5-dae79ab5a862)

```
Screen: Revolut — Scan
├ Chrome row (fixed, top, ~16pt below status bar)
│ ├ ✕ — bare white glyph ~20px, left                        [tap → dismiss]
│ └ Flash-off ⚡̸ — bare white glyph ~20px, right             [tap → torch]
├ Frame — ~170pt square, centred, sits at ~26% viewport height
│         hairline stroke ~1.5pt white, ~28pt corner radius, NO brackets
├ Caption pill — ~14pt below frame, rgba(255,255,255,0.10) fill,
│                radius full, 12pt v-padding / 20pt h-padding
│                "Scan code to pay" — 15px regular white
└ Segmented (fixed, ~90pt above home indicator)
  └ capsule ~150pt × 34pt, "Pay" active | "Receive" inactive
```

**Hierarchy.** Frame, caption pill, segmented control. The chrome glyphs are
deliberately near-invisible.

**Copy.** "Scan code to pay" · "Pay" / "Receive"

**Behavior.** Frame is decorative — decoding happens over the whole feed. Caption is
static. Segmented swaps surfaces.

**Context.** Reached from the Revolut home "Pay" action; leads to a confirm sheet.

**Verdict — adapt one thing.** The caption **pill** (dark chip, radius full, sitting
just under the frame) is the pattern Nightmarket already uses for its rejection
`notice`. Revolut proves the same chip works as a standing caption too — which is what
makes §5.2's "same slot, two states" work. Leave the hairline frame: a 1.5pt stroke over
live video at night is not readable, and Revolut can get away with it because its
capture shows a black ground.

---

### 3.3 PayPal — QR Code / Scan

[screen](https://mobbin.com/screens/7720fa67-5720-498d-bc82-b28ad4fc83b1)

```
Screen: PayPal — QR Code
├ Nav bar (fixed) — light ground
│ ├ ← back, left
│ └ "QR Code" — 17px semibold, centred
├ Tab capsule (fixed) — full-width minus 16pt gutters, 40pt tall,
│                       #F1F1F1 track, active = black pill + white label
│                       "Scan" | "Your code" | "Show to Pay"
└ Camera pane — black, full-bleed to the tab capsule
  ├ 4 corner brackets — hairline ~1.5pt white, ~230pt apart,
  │                     ~14pt radius elbows, arms ~34pt
  └ "Align QR code in frame" — 14px regular white, ~30pt below the
                               bottom brackets, centred
```

**Hierarchy.** Tab capsule reads first (it is the only high-contrast object), then the
brackets, then the caption. That is arguably wrong for a scanner — the navigation
outranks the camera.

**Copy.** "Align QR code in frame" · "Scan" / "Your code" / "Show to Pay"

**Behavior.** Three-way tab swap, in place.

**Context.** Pushed from PayPal's home scanner button.

**Verdict — leave, with one borrowed fact.** Three peer tabs above a viewfinder is the
anti-pattern in §6.1. The borrowed fact: the caption sits **below** the frame, not
inside it, and every payment reference except Family does the same. Nightmarket's
caption slot goes below the window.

---

### 3.4 Telegram — Scan QR

[screen](https://mobbin.com/screens/302aca5a-0b2b-45c7-b8e7-b790e4e221fa)

```
Screen: Telegram — Scan QR
├ "‹ Back" — 17px, left, top                                [tap → pop]
├ Frame — 4 corner brackets, hairline ~2pt white, ~230pt apart,
│         ~16pt radius elbows, centred at ~40% viewport height
│         No caption. No instruction. Nothing else in the field.
└ Control row (fixed, bottom, ~120pt above home indicator)
  ├ Gallery — circle 56pt, rgba(255,255,255,0.18), icon 24pt   [tap → picker]
  └ Torch  — circle 56pt, rgba(255,255,255,0.18), icon 24pt   [tap → torch]
      gap between them ~40pt, pair centred
```

**Hierarchy.** Frame, then the two circles, then Back. No text at all in the field.

**Copy.** "Back" only. This is the one reference with no standing caption — and it is
also the one reference that is not a payment scanner, so it has no accepted-code-type to
name.

**Behavior.** Both circles are icon-only, equal weight, side by side.

**Context.** Reached from Settings → Devices and from chat attachment menus.

**Verdict — adapt.** Telegram is the proof that **gallery import belongs as an icon, not
as a labelled pill.** It gives gallery exactly the same visual weight as the torch,
because both are "how the camera gets its picture" and neither is the subject. See
§5.3.

---

### 3.5 Klarna — scan / photo search

[screen](https://mobbin.com/screens/62ca396a-1526-4c52-afcc-1cddca8f22a9)

```
Screen: Klarna — Scan
├ ← back — bare white glyph, top-left
├ Camera — FULL BLEED, live, undimmed, full colour
├ Corner arcs — 4 thin white arcs, ~2pt, at the corners of a region
│               ~340pt tall spanning nearly the full width.
│               NOTE: over the bright vitamin bottle in this capture the
│               top-right arc is barely legible. Same failure as §5.4.
├ Caption chip — rgba(0,0,0,0.55), radius ~10, 2 lines, 13px white,
│                sits ~60pt above the control row
│                "Search by taking a photo or uploading from album.
│                 Pay by scanning a QR."
└ Control row (fixed, bottom)
  ├ Gallery — rounded square ~40pt, rgba(255,255,255,0.20), left
  ├ Shutter — white circle ~64pt with 3pt white ring, centred
  └ Flash-off — bare white glyph ~24pt, right
```

**Hierarchy.** The live subject first (there is no scrim at all), then the shutter, then
the caption chip, then the small controls.

**Copy.** "Search by taking a photo or uploading from album. Pay by scanning a QR."

**Behavior.** Shutter takes a photo for visual search; QR decoding runs continuously in
the background with no explicit affordance.

**Context.** Klarna's universal search entry point.

**Verdict — take the caption chip's ground, leave the rest.** `rgba(0,0,0,0.55)` behind
13px white is the measured floor for legible text over undimmed live video, and
Nightmarket's `CHROME` is `rgba(0,0,0,0.62)` — already above it. Confirms the existing
chip is correct. Klarna also independently reproduces the white-mark-on-bright-subject
failure this doc's §5.4 fixes, which is evidence it is a general problem and not a
Nightmarket bug.

---

### 3.6 Shopee — Scan QRIS

[screen](https://mobbin.com/screens/a1507463-ad41-4b03-860f-2256535a1c34)

```
Screen: Shopee — Scan
├ Chrome row (fixed, top)
│ ├ ← back — circle ~36pt, rgba(0,0,0,0.35), left
│ ├ Torch — circle ~36pt, WHITE fill (lit state), centred
│ │   └ tooltip below it — black chip, radius 6, "Tap to turn off", 12px
│ └ Gallery 🖼 — circle ~36pt, rgba(0,0,0,0.35), right    [tap → picker]
├ "Scan [QRIS logo]" — 14px white, centred, ~12pt above frame
├ Frame — ~270pt square, scrim OUTSIDE it (feed dimmed ~45%),
│         4 white corner brackets ~4pt stroke, ~28pt arms, at the corners
│         + animated red horizontal scan line sweeping the window
├ Promo pill — white, radius full, ~28pt tall, coin icon + 13px text
│              "ShopeePay App, Claim 100RB & Car"
├ "My QR Code" — WHITE full-width button, 52pt tall, radius ~12,
│                QR glyph + 16px semibold black label   [tap → own code]
└ "Explore Supported International QR Codes" — 13px link, blue, centred
```

**Hierarchy.** The window (it is the only undimmed thing), then the white "My QR Code"
button, then the torch (lit = white = brightest chrome), then everything else.

**Copy.** "Scan QRIS" · "My QR Code" · "Explore Supported International QR Codes" ·
"Tap to turn off"

**Behavior.** Torch shows an explicit tooltip for its on state. Gallery is a top-bar
icon. The full-width white button is the peer action, not the gallery.

**Context.** Reached from Shopee's Pay tab.

**Verdict — take two facts.** (1) The **lit torch is the brightest object on screen** —
white fill, everything else translucent black. Nightmarket already does exactly this
(`torchOn: { backgroundColor: MARK }`), independently confirmed. (2) **Gallery lives in
the top chrome row alongside the torch**, and the prime slot under the window is spent
on the peer action. Both are camera-input controls; grouping them is what the reference
does. Leave the scan line — a sweeping line implies progress the decoder does not
actually make.

---

### 3.7 Coinbase Wallet — Scan QR code (inside the send flow)

[flow](https://mobbin.com/flows/2dc240ce-1a91-4ded-84f2-6670850988e3) ·
[screen](https://mobbin.com/screens/ab567bb4-0c5b-44f9-a76b-6f27f53617cb)

```
Screen: Coinbase Wallet — Scan QR code
├ Header (fixed) — "Scan QR code" 17px semibold centred; ✕ right
├ Frame — ~250pt square, hairline rounded rect + heavier corner accents,
│         ~14pt radius, centred at ~32% viewport height
└ Helper — 2 lines, 16px regular white, centred, ~24pt below frame
           "Send crypto and connect to dapps by scanning a QR code"
```

**Hierarchy.** Frame, helper, header. Nothing else exists.

**Copy.** "Send crypto and connect to dapps by scanning a QR code"

**Behavior.** Decode → push into the send flow. No gallery, no torch on this screen.

**Context.** Step 3 of a 10-screen send flow: home → choose asset → **scan** → address
matched → amount pad → confirm → success. The scan screen is a *step*, not a home.

**Verdict — take the copy pattern.** Every payment reference's caption names **what kind
of code is accepted**, not how to hold the phone: "Scan an Ethereum wallet address",
"Send crypto and connect to dapps", "Scan a ShopBack QR code to pay", "Scan code to
pay". None of them say "point your camera at a code". This is the distinction that
resolves §5.2.

---

### 3.8 ShopBack — Scan QR

[flow](https://mobbin.com/flows/88247976-bc1b-42a3-9dfb-f1fbc4a4549c) ·
[screen](https://mobbin.com/screens/266455df-858a-4baa-a760-04712f7c009e)

```
Screen: ShopBack — Scan QR
├ Chrome row (fixed, top) — ‹ left · 🖼 gallery + ⓘ help, right
├ Scan glyph — circle ~48pt, rgba(255,255,255,0.20), centred,
│              ~40pt above the caption
├ "Scan a ShopBack QR code to pay" — 15px semibold white, centred
├ Frame — ~230pt square, 4 thick white rounded brackets ~7pt stroke,
│         ~20pt elbow radius, arms ~55pt. Ground is near-black.
└ "⊞ Show Payment Code" — WHITE pill, full-width minus 40pt gutters,
                          52pt tall, radius full, black 16px semibold label
```

**Hierarchy.** The white pill first (highest contrast object on screen), then the
brackets, then the caption. **The peer action outranks the viewfinder**, which for a
scanner is the wrong way round — but it tells you what the slot under the frame is
worth.

**Copy.** "Scan a ShopBack QR code to pay" · "Show Payment Code"

**Verdict — leave the layout, take the copy shape.** `"Scan a <brand> <thing> to pay"`
is the canonical caption formula across these references.

---

### 3.9 Setel — Present code to pay (adjacent, for the balance question)

[screen](https://mobbin.com/screens/8b3e7d15-a49d-4e7b-82d9-5b0ef056e7f4)

```
Screen: Setel — Pay
├ Code card — white, radius ~16, holds the barcode + QR
├ "SCAN QR CODE" — white pill, radius full, ~44pt, blue 14px semibold label
├ Balance row — white card, radius ~10, ~56pt tall, 16pt padding
│ ├ token logo 24pt + "Balance" 12px grey + "RM 0.00 ⌃" 15px semibold
│ └ "TOP UP" — outlined pill, ~32pt tall, blue 1pt border, blue 12px label
└ Tile row + promo + tab bar
```

**Hierarchy.** Code, scan pill, then balance-with-Top-up as one object.

**Copy.** "Balance" · "TOP UP" · "SCAN QR CODE"

**Verdict — adapt, cautiously.** This is the only reference that puts spendable money on
a pay surface, and it pairs the number with the action that changes it. Nightmarket has
both pieces already (`useBalance`, `/(market)/top-up`) but its strip shows only an
address. See §5.5 — and note §2's caveat: one reference, not a convergence.

---

## 4. Common denominator

Structure the references converge on, top to bottom. `n/9` counts how many of §3's nine
blocks include the element.

```
Scanner (common denominator)
├ Chrome row (fixed, top)                                             9/9
│ ├ dismiss/back — left                                              8/9
│ └ camera controls — right or clustered: torch, gallery             9/9 torch, 5/9 gallery
├ Frame — square, centred, 170–270pt, sits at 26–40% viewport height  9/9
│ └ corner marks — brackets in 7/9, hairline rect in 2/9             9/9
├ Standing caption — 13–16px, centred, directly below or inside
│   the frame, NAMES THE ACCEPTED CODE TYPE                          8/9
├ Error line — replaces or joins the caption, red, frame recolours    1/9 observed
│   (only Family captures an error state; the rest have no capture)
└ Peer surface (fixed, bottom)                                       8/9
  ├ "my code" / receive — segmented control or full-width button     7/9
  └ account/balance identity                                         2/9
```

Where the count is decisive: **every payments scanner has a standing caption that names
the code type** (8/9; the one exception, Telegram, is not a payments scanner). **Torch is
always present and is never the loudest thing on screen unless it is lit.** **Gallery,
where it exists, is always an icon and never a labelled button** (5/5).

Where the count is decisive but does not apply: 7/9 have a "show my own code" peer.
Nightmarket cannot — see §5.1.

---

## 5. Divergences

### 5.1 Peer "my code" surface — references say yes, this repo says no

**Options.** (a) Add a Scan/Receive segmented control (Family, Base, Revolut, Lex,
Mercari). (b) Add a full-width "Show my code" button (Shopee, ShopBack, Glow). (c)
Nothing.

**This repo takes (c).** Nightmarket is a one-directional payer: the user pays merchant
codes, and no route in `apps/mobile/app/(market)/` produces a payment-request code. The
one QR the app renders is the deposit address on `/(market)/top-up.tsx` (line 179,
`QRCodeStyled`), which is a funding address, not a request to be paid — putting it
behind a "Receive" segment on the scanner would advertise a receive capability the
product does not have.

**Consequence for this redesign.** The prime slot under the window, which 7/9 references
spend on the peer action, is free. It goes to the caption (§5.2) and the space is
otherwise left empty — not backfilled with the gallery button (§5.3).

---

### 5.2 Standing caption — 8/9 references have one; the current screen deliberately does not

`index.tsx` lines 311–325 argue the case against: *"a live viewfinder with a frame drawn
on it already says what to do, and a caption repeating it is a line the user reads once
and then reads past forever."*

**That argument is correct about the caption it rejects, and the references do not write
that caption.** None of them say how to hold the phone. Every one of them names what is
accepted:

- Coinbase Wallet — "Send crypto and connect to dapps by scanning a QR code"
- Family — "Scan an Ethereum wallet address or connect to a desktop app"
- ShopBack — "Scan a ShopBack QR code to pay"
- Revolut — "Scan code to pay"
- Base — "Scan a QR code to send crypto"

This matters more for Nightmarket than for any of them, because Nightmarket's decoder
**rejects most QR codes it sees**. `isPaymentQr` gates every read, and today the first
time a user learns which codes work is the rejection: *"That's not a Yodl payment
code"* — information delivered only after failure, on a 1.8s timer.

**This repo takes: a standing caption that names the accepted code type**, occupying the
same chip the rejection already uses, so the rejection *replaces* it rather than being
inserted above it. One slot, two states, zero layout movement. That is strictly better
than Family, which pushes its helper down when the error appears.

**Copy:** `Scan a Yodl payment code` (standing) → `That's not a Yodl payment code`
(rejected). The two sentences are the same shape, so the swap reads as an answer to the
first line rather than as a new object appearing.

---

### 5.3 Gallery import — labelled pill vs icon

Current: a labelled pill, `radius.full`, 44pt tall, `CHROME` fill, sitting in the prime
slot directly under the window (`styles.photoPill`, lines 572–581). It is the only
`radius.full` element on the screen, which per `tokens.ts` lines 27–31 is reserved for
*the primary CTA*.

**The gallery is not the primary action of a scanner.** The camera is. 5/5 references
that offer gallery import render it as an icon of equal weight to the torch — Telegram
(56pt circle, paired with torch), Klarna (40pt tile, bottom-left), Shopee (36pt circle,
top-right), Gojek (top-right cluster), ShopBack (top-right).

**Options.** (a) Move it into the top chrome row as a second 44pt `radius.tile` control,
left of the torch — matches Shopee/Gojek/ShopBack. (b) Pair it with the torch as two
tiles at the bottom — matches Telegram. (c) Keep the pill.

**This repo takes (a).** It groups the two controls that both answer *"where does the
image come from"*, it frees the slot under the window for the caption, and it stops the
screen spending its one-per-screen `radius.full` on a secondary action.

**Against it:** `index.tsx` lines 253–258 argue the torch should sit alone, because
*"the moment it shares a row with navigation it becomes one of four identical circles
nobody can tell apart."* The counter is that a gallery tile is not navigation — it is a
second camera input, which is exactly why Shopee and Gojek group them — and two tiles is
a long way from four. The tiles are also distinguishable by more than position: the
torch takes a lit state that turns it solid white, and the gallery takes a busy state
that swaps its glyph for a spinner. **This is the change most likely to be reversed on
review; it is called out first in §8.**

---

### 5.4 Finder marks disappear over a bright subject — observed, not researched

In the supplied Android capture, the top-left finder mark sits over the bright
yellow-green region of the emulator's test scene and is **effectively invisible**;
the bottom two marks, over darker ground, read clearly. The cause is structural: the
marks are drawn at `MARK` (`rgba(255,255,255,0.92)`) and they sit *inside* the window,
which is the one region of the screen that is **not** dimmed by the scrim. White on
undimmed daylight video has no guaranteed contrast.

Klarna reproduces the same failure independently (§3.5) — its top-right corner arc
vanishes against a white vitamin label — so this is a general problem with white marks
over live video, not a Nightmarket-specific bug.

How the references that dim their feed avoid it: Shopee puts white brackets on a feed
dimmed ~45% and keeps the brackets **at the window edge**, half on the scrim; Minna Bank
abandons white entirely for chartreuse `#D9F034`.

**Options.** (a) Give each mark a dark halo — a second ring drawn beneath the existing
one at a heavier stroke in `rgba(0,0,0,0.45)`. (b) Recolour the marks to a bright
non-white hue. (c) Move the marks onto the scrim boundary.

**This repo takes (a).** (b) introduces a colour the palette does not have and would
collide with the "Ultramarine means settled" rule in `palette.ts`. (c) changes the
frame's geometry and weakens the quiet-zone reading that `FINDER_INSET = space.md`
encodes. (a) is four lines in `IconFinder`, changes nothing about the drawing at rest,
and makes the mark legible on any ground.

---

### 5.5 Wallet strip — address only vs balance

Current: `Paying from` / `0x1293…d4bB` on the left, `Activity ›` on the right.

Setel (§3.9) is the only reference that puts money on a pay surface, and it pairs the
number with Top up. Family's equivalent object shows a wallet *name*, not a balance.
So the evidence is one-for, one-against, and the argument has to carry the decision.

**The argument.** The strip's question is *"what is about to pay for this"* (per
`index.tsx` line 362). An address answers *which* wallet; it does not answer *whether it
can pay*. The user is standing at a stall about to commit — and the app already holds
the number, focus-refetched, at `useBalance(wallet.provider, wallet.address,
wallet.chainId)`.

**Options.** (a) Right column becomes the spendable amount + chevron, replacing the
"Activity" label. (b) Add balance as a third line. (c) Leave as-is.

**This repo takes (a).** The chevron already says the row goes somewhere, so the
"Activity" word is doing the least work of anything on the strip; and the row it leads
to is the balance screen, so the number is also a label for the destination. Keep the
address — it is the identity half and `truncateAddress` already sizes it.

**Cost, stated plainly:** this puts an RPC `balanceOf` read on the app's launch path,
where there is none today. It is one call, on focus, on a hook that already exists and
already tolerates failure. `Resource<Balance>` has loading and error states and both
must render (§7 States) — a scanner that shows a stale or blank number where money
should be is worse than one that shows no number.

---

## 6. Anti-patterns

**6.1 Peer tabs above the viewfinder** (PayPal, Kakao Pay). A high-contrast segmented
control at the top of the screen outranks the camera, which is the subject. Kakao Pay's
yellow capsule is the loudest object on a screen whose job is to decode. Put peers at
the bottom (Family, Revolut) or nowhere.

**6.2 An animated scan line** (Shopee, Minna Bank, GCOO). A sweeping line implies the
decoder is making linear progress through the frame. It is not — it either reads the
code or it does not. When a code fails, the line keeps sweeping, which tells the user to
keep waiting for something that will never arrive.

**6.3 A tooltip for the torch's on state** (Shopee's "Tap to turn off"). The control's
own fill already carries the state — white when lit. A chip explaining it is a second
object to dismiss on a screen where the user's hands are occupied holding the phone at
a stall.

**6.4 Truncating the thing the user must verify.** Nightmarket avoids this today and
must keep avoiding it: the wallet address on the strip is truncated, which is correct
because it is an *identity glance*, but any amount, merchant name, or address the user
must **check before committing** belongs on `/(market)/pay` in full. Do not add a
"detected: 0x1234…" preview to the scanner.

**6.5 Instructional captions that describe the gesture.** "Align QR code in frame"
(PayPal), "Position the front of your document in the frame" (Nutmeg). The frame already
says this. A caption earns its slot only by naming what is *accepted* — which is the
whole basis of §5.2.

**6.6 Silently ignoring a rejected code.** Already avoided (`reject()` at line 157) and
worth restating, because the redesign moves the rejection into a shared slot and the
temptation will be to let the caption sit there unchanged. A camera that quietly drops a
code is indistinguishable from one that will not focus.

---

## 7. Spec

### Layout tree — `Scanner` (permission granted, wallet present)

```
Screen: (market)/index.tsx — Scanner        ground: live CameraView, absoluteFill
├ StatusBar style="light" (unchanged)
├ CameraView (absoluteFill, mounted only while `focused`)   — unchanged
└ chrome (absoluteFill, pointerEvents="box-none")
  ├ above (flex: 1, bg SCRIM, paddingTop insets.top + space.md,
  │        paddingHorizontal space.xl, row, space-between)
  │ ├ wordmark — row, gap space.sm, height 44
  │ │ ├ <IconFinder size={20} color={MARK} />
  │ │ └ "Nightmarket" — <Txt variant="bodyStrong"> color MARK
  │ └ controls — row, gap space.sm                                    ← CHANGED
  │   ├ Photo tile — 44×44, radius.tile, bg CHROME                    ← MOVED HERE
  │   │   <IconPhoto size={22} color={MARK} />  or <ActivityIndicator size="small"
  │   │   color={MARK} /> while checkingImage
  │   │                              [tap → ImagePicker → decode → accept/reject]
  │   └ Torch tile — 44×44, radius.tile, bg CHROME (bg MARK when lit)
  │       <IconTorch size={22} color={torch ? ON_LIGHT : MARK} />
  │                                                        [tap → toggle torch]
  ├ band (row, height = frame)                    — geometry unchanged
  │ ├ scrim (flex 1, bg SCRIM)
  │ ├ window (width = frame, alignSelf stretch)
  │ │ ├ reject wash — absoluteFill, bg REJECT_WASH, only while rejection !== null
  │ │ │                                                              ← NEW
  │ │ └ 4 × Finder — FINDER 28pt, inset FINDER_INSET (space.md)
  │ │     <IconFinder size={28} color={MARK} halo={HALO}             ← halo NEW
  │ │                 core={rejected ? REJECT : MARK} />
  │ └ scrim (flex 1, bg SCRIM)
  └ below (flex 1.3, bg SCRIM, align center,
           paddingHorizontal space.xl, paddingBottom insets.bottom + space.lg)
    ├ Caption chip — marginTop space.lg, radius.control, bg CHROME,   ← NEW/REUSED
    │                paddingHorizontal space.lg, paddingVertical space.sm
    │   └ <Txt variant="bodyStrong"> centred, accessibilityLiveRegion="polite"
    │       idle:     "Scan a Yodl payment code"        color MARK
    │       rejected: <the rejection message>           color REJECT
    ├ spacer (flex 1, minHeight space.lg)
    └ walletStrip — alignSelf stretch, minHeight 64, row, space-between,
                    radius.card, bg CHROME, padding space.lg / space.md
      ├ identity (gap 2, flexShrink 1)
      │ ├ "Paying from" — <Txt variant="caption"> color DIM
      │ └ address — <Txt variant="mono" numberOfLines={1}> color MARK
      │             truncateAddress(wallet.address) | "connecting…"
      └ money (row, align center, gap space.xs)                       ← CHANGED
        ├ amount — <Txt variant="amountRow"> color MARK
        │          balance.data.amount | "—" (error) | "" (loading→spinner)
        └ <IconChevron size={16} color={DIM} />
                                        [tap → router.push('/(market)/activity')]
```

`frame` stays `Math.round(Math.max(220, Math.min(280, width * 0.72)))`. The `band` height
stays fixed so the aim point never moves.

### Elements

| Element | Content / copy | Component | Tokens | Behavior |
|---|---|---|---|---|
| Wordmark | "Nightmarket" | `<IconFinder>` from `src/ui/Icon.tsx` + `<Txt variant="bodyStrong">` from `src/ui/Txt.tsx` | `space.sm`, `space.xl`, local `MARK` | none (not pressable) |
| Photo tile | icon only, a11y label "Open photo" | `<Pressable>` + `<IconPhoto size={22}>` from `src/ui/Icon.tsx` | `radius.tile` from `@nightmarket/theme`, local `CHROME`, `MARK` | tap → light haptic → `ImagePicker.launchImageLibraryAsync` → `scanFromURLAsync` → accept/reject. Shows `<ActivityIndicator size="small" color={MARK}>` and `disabled` while `checkingImage`; `accessibilityState={{ busy: checkingImage }}` |
| Torch tile | icon only, a11y label "Torch" / "Torch on" | `<Pressable>` + `<IconTorch size={22}>` | `radius.tile`, `CHROME` → `MARK` when lit, glyph `MARK` → `ON_LIGHT` when lit | tap → light haptic → `setTorch(on => !on)`; `accessibilityState={{ selected: torch }}` |
| Finder mark ×4 | — | `<IconFinder size={28} color={MARK} halo={HALO} core={…}>` | local `MARK`, `REJECT`, new `HALO`; inset `space.md` | non-interactive, `pointerEvents="none"`. `core` = `REJECT` for the rejection cooldown |
| Reject wash | — | plain `<View>` | local `REJECT_WASH` | rendered only while `rejection !== null`, `pointerEvents="none"`, `StyleSheet.absoluteFill` inside `window` |
| Caption chip | idle "Scan a Yodl payment code" · rejected: the rejection string | `<Txt variant="bodyStrong">` inside a `<View>` | `radius.control`, `CHROME`, `space.lg`, `space.sm`; text `MARK` → `REJECT` | non-interactive. `accessibilityLiveRegion="polite"` stays on the `<Txt>` so the swap is announced |
| Wallet strip | "Paying from" / truncated address / balance amount | `<Pressable>` + `<Txt variant="caption" \| "mono" \| "amountRow">` + `<IconChevron size={16}>` | `radius.card`, `CHROME`, `space.lg`, `space.md`, `space.xs`; `MARK` / `DIM` | tap → `router.push('/(market)/activity')`; a11y label "Your wallet and activity" |

**New local constants** in `index.tsx`, alongside the existing hardcoded block (lines
85–92), with the same justification comment — the ground is live video, not a palette
surface:

```
HALO        = 'rgba(0,0,0,0.45)'   // under-stroke behind each finder mark
REJECT_WASH = 'rgba(255,138,117,0.18)'  // REJECT at 18% — the window's error fill
```

`REJECT` stays `#FF8A75`, which is `palette.dark.error` (`packages/theme/src/palette.ts`
line 116) written out, because this screen is Ink in both schemes.

### States

| State | What the user sees |
|---|---|
| **Wallet missing** (`wallet.needsWallet`) | `<NeedsWallet>` gate — unchanged |
| **Permission unknown** (`!permission`) | bare `<Screen />` — unchanged |
| **Permission denied, can ask** | `<NeedsCamera>` "Let the camera see" / "Allow camera" — unchanged |
| **Permission denied, blocked** | `<NeedsCamera>` "Camera is switched off" / "Open settings" — unchanged |
| **Idle (armed)** | Live feed, dimmed except the window. Caption chip reads "Scan a Yodl payment code" in `MARK`. Finder marks white with halo, cores `MARK`. Both chrome tiles at `CHROME`. |
| **Torch on** | Torch tile fills `MARK`, glyph `ON_LIGHT`. Nothing else changes. |
| **Rejected** (1.8s, `REJECT_COOLDOWN_MS`) | Caption chip text swaps to the rejection string in `REJECT`; the chip does not move or resize beyond its own text reflow. Window fills `REJECT_WASH`. Four finder cores fill `REJECT`. Warning haptic. Scanner disarmed via `handled.current`. Auto-restores to idle. |
| **Accepted** | Success haptic, immediate `router.push` to `/(market)/pay`. No visual confirmation on this screen — the push is the confirmation. |
| **Picking a photo** (`checkingImage`) | Photo tile shows `<ActivityIndicator size="small" color={MARK}>` in place of the glyph and is `disabled`. Camera keeps running and can still accept a scan. |
| **Photo picker cancelled** | Silent return to idle. No message — the user chose to cancel. |
| **Photo with no QR** | Rejected state, "No QR code in that image" |
| **Photo with a non-Yodl QR** | Rejected state, "That image's code isn't a Yodl payment code" |
| **Photo unreadable** | Rejected state, "Couldn't read that image" |
| **Balance loading** | Strip's money column shows `<ActivityIndicator size="small" color={DIM}>` in place of the amount. Chevron stays. Address renders normally — it does not wait on the balance. |
| **Balance failed / unsupported chain** | Money column shows `—` in `<Txt variant="amountRow">` at `DIM`, not `MARK`. **Never a `$0.00`.** The strip stays tappable; the reason lives on `/(market)/activity`. |
| **Wallet connecting** (`wallet.address === null`) | Address line reads `connecting…`; money column shows the loading spinner (the balance hook is not `ready` without an address). |
| **Screen blurred** | `CameraView` unmounts, torch forced off — unchanged (`useFocusEffect`). |

### Data

| Need | Source | Shape | While absent |
|---|---|---|---|
| Camera permission | `useCameraPermissions()` from `expo-camera`, re-read on `AppState` `active` | `PermissionResponse \| null` | `<Screen />` |
| Wallet | `useWallet()` from `~/wallet/useWallet` | `{ provider, address, chainId, isConnected, needsWallet, … }` | gate or `connecting…` |
| Spendable balance | `useBalance(wallet.provider, wallet.address, wallet.chainId)` from `~/wallet/useBalance` | `Resource<Balance>`; `Balance = { amount: string; isZero: boolean; token: 'USDC'; chainId: number }` | spinner, then `—` on error |
| QR validity | `isPaymentQr(data)` from `@yodlpay/react-native` — pure, no SDK instance | `boolean` | n/a |

`useBalance` refetches on focus via `useResource`, which is the correct trigger here for
the same reason it is on `/(market)/activity`: the user leaves to pay and comes back.
Do **not** add polling.

### Files

**Modify** `apps/mobile/src/ui/Icon.tsx`
- Add an optional `halo?: string` to `IconFinderProps`, documented in the existing
  comment style. When present, `IconFinder` renders one extra `<Rect>` **before** the
  existing ring, with identical geometry (`x=4 y=4 w=16 h=16 rx=5`), `stroke={halo}`,
  `strokeWidth={5}`, `strokeLinejoin="round"`. Everything else is untouched, and
  `IconFinder` with no `halo` must render byte-identically to today — it is used at 20pt
  in the wordmark and on `sign-in`.

**Modify** `apps/mobile/app/(market)/index.tsx`
- Add `HALO` and `REJECT_WASH` to the hardcoded-colour block, under the existing comment.
- Move the photo control out of `below` and into the `above` row as a 44pt tile beside
  the torch; wrap the two in a `controls` row with `gap: space.sm`. Delete
  `styles.photoPill`.
- Replace the conditional rejection block with a permanent caption chip whose text and
  colour depend on `rejection`. Rename `styles.message` / `styles.notice` to reflect
  that they are now the standing caption, and drop `styles.message`'s conditional
  mounting.
- Add the `REJECT_WASH` view inside `styles.window`, mounted only while rejecting.
- Pass `halo={HALO}` from `<Finder>` to `<IconFinder>`.
- Call `useBalance` and render the money column in `walletStrip`, replacing the
  "Activity" caption. Keep `walletMore` as the container.
- Update the file's header comment and the inline comments at lines 253–258 and 311–325,
  which currently argue for the layout being replaced. **Do not leave them contradicting
  the code** — they are the reason the current design is legible, and a stale one is
  worse than none. State the new reasoning in the same register.

**Create:** nothing.

### Build order

1. `src/ui/Icon.tsx` — add `halo` to `IconFinder`. Verify the no-`halo` render is
   unchanged (the wordmark and `sign-in.tsx` both consume it).
2. `index.tsx` — add `HALO` / `REJECT_WASH` constants and pass `halo` through `<Finder>`.
   Smallest visible win, no layout change.
3. `index.tsx` — caption chip: make it permanent, add the idle copy, swap text + colour
   on `rejection`, add the window wash. Delete the conditional mount.
4. `index.tsx` — move the photo control into the top row as a tile; delete `photoPill`;
   add the `controls` row style.
5. `index.tsx` — wire `useBalance` into `walletStrip` with all three of its states.
6. `index.tsx` — rewrite the header and inline comments to match what the file now does.

### Acceptance criteria

1. `IconFinder` called without `halo` renders exactly the two `<Rect>` elements it
   renders today; the wordmark at 20pt and `sign-in.tsx` are visually unchanged.
2. Each of the four finder marks in the window has a `rgba(0,0,0,0.45)` ring at
   `strokeWidth={5}` drawn beneath its white ring.
3. On first paint with permission granted, a chip below the window reads exactly
   `Scan a Yodl payment code`.
4. On a rejected scan, that same chip reads the rejection string in `#FF8A75`, and no
   element above it changes position. The chip's own `top` coordinate is identical
   before and during a rejection.
5. During a rejection the window interior is filled with `rgba(255,138,117,0.18)` and
   all four finder cores are `#FF8A75`; after `REJECT_COOLDOWN_MS` (1800ms) both revert.
6. The top row contains exactly two 44×44 `radius.tile` controls — photo then torch —
   with `space.sm` between them, right-aligned, opposite the wordmark.
7. No element on the screen uses `radius.full`.
8. Tapping the photo tile opens the OS image picker; while it is working the tile shows
   a spinner and is `disabled`; cancelling produces no message.
9. The wallet strip's right column shows the USDC balance from `useBalance` when
   resolved, a spinner while loading, and `—` on error. It never shows `$0.00` for a
   failed read.
10. Tapping the wallet strip navigates to `/(market)/activity`.
11. At 320pt viewport width the frame is 230pt (`max(220, min(280, 320*0.72))`), the
    wallet strip is not clipped, and the caption chip's text does not wrap to more than
    two lines.
12. `pnpm typecheck` and `pnpm lint` pass.
13. No comment in `index.tsx` describes a layout the file no longer has — specifically,
    the "torch sits alone up here" and "Rejections only / there is no standing
    instruction" passages are rewritten, not left in place.

---

## 8. Open questions

1. **Photo tile beside the torch, or keep the labelled pill?** (§5.3) The current
   pill's own comment argues against a shared chrome row. Options: (a) two tiles in the
   top row — matches Shopee/Gojek/ShopBack and frees the prime slot; (b) keep the pill
   under the window and put the caption above it; (c) two tiles at the bottom, Telegram
   style. **Recommendation: (a).** It is the change most worth your veto — say "keep the
   pill" and steps 4 and the `photoPill` deletion drop out of the build with no other
   consequence.

2. **Balance on the wallet strip?** (§5.5) It puts an RPC read on the launch path and
   rests on one reference. Options: (a) replace the "Activity" label with the amount;
   (b) leave the strip alone. **Recommendation: (a)** — but if the launch-path read
   bothers you, (b) costs nothing else in this doc.

3. **Caption copy.** `Scan a Yodl payment code` mirrors the rejection sentence exactly.
   Alternative: `Point at a stall's Yodl code`, which is warmer and names the place, but
   drifts toward the instructional caption §6.5 rejects. **Recommendation: the first.**

4. **Should the caption hide once the user has paid once?** No reference does this and
   it would mean persisting a "has scanned" flag the app does not currently keep.
   **Recommendation: no** — a first-run-only caption is invisible in exactly the review
   where you would notice it was wrong.
