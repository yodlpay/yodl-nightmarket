/**
 * Nightmarket — everything in the design system that isn't a colour.
 *
 * Spacing is a 4pt grid, but only six of the steps are named. Naming every
 * multiple of four invites picking one at random; six forces a decision.
 */

export const space = {
  /** Hairline gaps: icon-to-label, badge padding. */
  xs: 4,
  /** Inside a control. */
  sm: 8,
  /** The default gap between related things. */
  md: 12,
  /** Card padding, gap between unrelated things. */
  lg: 16,
  /** Section gap. */
  xl: 24,
  /** Screen gutter, gap between major blocks. */
  xxl: 32,
} as const;

/**
 * Radii, named for the thing rather than for a size, because the size is not the
 * decision — a card is 20 because it is a card.
 *
 * `full` is **reserved for exactly one element per screen: the primary CTA pill.**
 * Nothing else in the app may use it. Everything else is a rounded rectangle, and
 * that restraint is what makes the pill read as *the* action. Avatars in
 * particular are 40pt rounded squares at `control`, not circles — a circular
 * avatar beside a circular status dot is half of what dates a payment feed.
 */
export const radius = {
  /** Chips, badges, the smallest enclosed marks. */
  chip: 10,
  /** Controls, list rows, avatars, text fields. */
  control: 14,
  /** 60pt action tiles and the torch — the Phantom/Revolut square. */
  tile: 18,
  /** Cards, day groups, sheets. */
  card: 20,
  /** The primary CTA pill. One per screen, nothing else. */
  full: 999,
} as const;

/**
 * One family plus one machine face.
 *
 * - **Instrument Sans** — everything. A neutral grotesque with slightly narrow
 *   proportions, so it holds density at 56pt instead of going airy, and unlike
 *   Inter it carries no every-SaaS-since-2018 association. There is no display
 *   face: a display face at hero size is the loudest single thing dating the old
 *   design, and a hero numeral does not need personality, it needs to be read.
 * - **DM Mono** — two jobs only, both of them literally machine output: wallet
 *   addresses and transaction hashes (`mono`), and the six-digit code field
 *   (`code`). Not amounts, not timestamps, not labels, not status, not error copy.
 *
 * Weights stop at 600. No 700 anywhere, and no italics — bold is the old design
 * shouting. The keys match the names passed to `useFonts()` in the app.
 */
export const font = {
  regular: 'InstrumentSans_400Regular',
  medium: 'InstrumentSans_500Medium',
  semibold: 'InstrumentSans_600SemiBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

/** Only the figure sets we actually ask for; keeps this package React-Native-free. */
type FontVariant = 'tabular-nums';

/** A complete type entry. Everything a `<Text>` needs, nothing it doesn't. */
export interface TypeStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontVariant?: FontVariant[];
  textAlign?: 'center';
}

/**
 * The scale. Every entry ships family, size, line height and tracking together,
 * because those four are a single decision and splitting them across props is how
 * a design system becomes a suggestion.
 *
 * Tracking is negative or zero, never positive — the one exception is `code`,
 * where the +6 is what separates six digits into six digits rather than a number.
 * All-caps does not appear anywhere in this scale and `Txt` has no `caps` prop:
 * an uppercase, wide-tracked mono eyebrow is as strong a period tell as a
 * gradient, and it was on nine screens.
 *
 * Money entries request `tabular-nums`, but nothing may *depend* on it — the
 * Android `tnum` table is not guaranteed to ship. Every amount column is
 * right-aligned, and the right alignment is the real mechanism.
 *
 * Named `typography` rather than `type` on purpose: `import { type } from …` is
 * ambiguous with TypeScript's type-only import syntax and does not parse.
 */
export const typography = {
  /** The wordmark. Sign-in only, and it is the only non-money type above 28. */
  display: { fontFamily: font.semibold, fontSize: 40, lineHeight: 42, letterSpacing: -1.0 },
  /** One per screen, maximum. The wallet card's numeral and nothing else. */
  amountHero: {
    fontFamily: font.semibold,
    fontSize: 56,
    lineHeight: 56,
    letterSpacing: -1.4,
    fontVariant: ['tabular-nums'],
  },
  amount: {
    fontFamily: font.semibold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.7,
    fontVariant: ['tabular-nums'],
  },
  /** Screen titles. */
  title: { fontFamily: font.semibold, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
  heading: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  /** The trailing amount on a feed row. A queue is scanned, not admired. */
  amountRow: {
    fontFamily: font.semibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: font.medium, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, letterSpacing: 0 },
  /** Sentence case, always. Day-group headers, timestamps, tile labels. */
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  /** Addresses and transaction hashes. One of DM Mono's two remaining jobs. */
  mono: { fontFamily: font.mono, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  /** The six-digit code field. The other one. */
  code: {
    fontFamily: font.monoMedium,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: 6,
    textAlign: 'center',
  },
} satisfies Record<string, TypeStyle>;

/**
 * Durations in ms. `snap` is for anything under the finger — above ~140ms a press
 * response stops feeling like a physical button and starts feeling like latency.
 */
export const duration = {
  snap: 120,
  base: 240,
  slow: 420,
} as const;

/**
 * The only shadow in the app, and it is neutral.
 *
 * **Light mode only, and only two objects app-wide** — the wallet card and the
 * floating CTA bar. Dark mode ships no shadow and no elevation at all: a shadow
 * is invisible on a near-black ground, which is precisely why dark UIs separate
 * by fill step and light UIs separate by shadow. `elevation: 0` keeps Android
 * from drawing a grey box in the dark scheme; the fill step already separates.
 *
 * This replaces the old coloured `glow`, which was the thing being fixed.
 */
export const lift = {
  shadowColor: '#000000',
  shadowOpacity: 0.06,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 6 },
  elevation: 0,
} as const;
