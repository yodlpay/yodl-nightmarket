/**
 * Nightmarket — the colour half of the design system.
 *
 * Two grounds, one hex each, and the inversion between them *is* the design:
 * Paper (`#F3F1EC`) is a warm grey stock, and Ink (`#1A1814`) is a warm charcoal
 * with no purple and no blue in it. Paper is dark mode's primary text; Ink is
 * light mode's. Neither mode is a tint of the other, and light mode is the
 * designed default rather than an afterthought — the app ships
 * `userInterfaceStyle: automatic`, so both are real.
 *
 * Three rules keep it coherent:
 *
 *  1. **Separation is a fill step, never a border.** `border` and `borderStrong`
 *     survive in this file for one reason only: the hosted Yodl WebView theme in
 *     `yodl.ts` takes them. No React Native component may import them, and
 *     `borderWidth` is banned in `apps/mobile` outside the finder-pattern drawing
 *     and a focused field's ring.
 *  2. **Elevation is directional.** `surface` steps *away* from the ground
 *     (raised: cards, day groups). `surfaceSecondary` steps *toward* it (inset:
 *     text fields, tiles, quiet buttons). A card and an input never share a fill.
 *  3. **One accent, and it is not a brand colour.** Ultramarine appears on
 *     exactly two things app-wide: the two bars of the settlement mark, and the
 *     focus ring of a focused text field. It means *this money has landed*. It is
 *     never a button, a card, an icon, a numeral or a dot. A screen with no
 *     settled money on it has no colour on it.
 *
 * `success`, `warning` and `info` are declared for the Yodl theme contract and are
 * deliberately **not** rendered by app code — status is a word in Slate plus a lit
 * or unlit settlement mark. `error` is the only status hue the app draws.
 *
 * Every pair below was checked on the surface it actually sits on, not merely on
 * the ground: the muted tiers were dragged darker (light) and lighter (dark) until
 * they cleared 4.5:1 on the *inset* fill, which is where "muted" really lands.
 */

/** Ink — the dark ground. Also the fill of the light-mode wallet card and CTA. */
const INK = '#1A1814';
/** Paper — the light ground. Also dark mode's primary text and CTA fill. */
const PAPER = '#F3F1EC';
/** The raised surface in dark mode. Shared verbatim with the hosted Yodl sheet. */
const INK_RAISED = '#262320';

/** Paper. The mode the app is designed in first. */
export const light = {
  /** Under the scroll bounce and behind the root Stack. Never a surface. */
  bgDeep: '#E7E4DD',
  /** Screen ground. */
  bg: PAPER,
  /** Raised — cards, day groups, the CTA bar scrim. No border, ever. */
  surface: '#FFFFFF',
  /** Pressed state for any Pressable surface or row. */
  surfaceHover: '#F0EEE8',
  /** Inset — a step *toward* the ground: fields, the OTP box, tiles. */
  surfaceSecondary: '#E9E6DF',
  /** Loading placeholders. */
  skeleton: '#E4E1D9',

  /** Yodl WebView theme only. Must not be imported by any app component. */
  border: '#E0DCD3',
  /** Yodl WebView theme only. Must not be imported by any app component. */
  borderStrong: '#C8C2B6',

  /** 15.70:1 on Paper, 17.73:1 on white. Also the primary CTA fill in light. */
  text: INK,
  /** Slate. 7.07:1 on Paper, 7.98:1 on white, 5.29:1 on the inset fill. */
  textSecondary: '#55504A',
  /** 5.57:1 on Paper, 5.05:1 on the inset fill — where muted actually sits. */
  textMuted: '#665F57',

  /** Ultramarine. Settlement mark and focus ring only. 7.51:1 on Paper. */
  accent: '#2A2FD6',
  /** Yodl WebView contract only. */
  accentStrong: '#4A50F0',
  /** Yodl WebView contract only. */
  accentDeep: '#191C8C',

  /** Yodl contract only — never rendered by app code. */
  success: '#0F6B45',
  /** Yodl contract only — never rendered by app code. */
  warning: '#8A5A00',
  /** The only status hue the app draws. 5.77:1 on Paper, 6.52:1 on white. */
  error: '#B3271A',
  /** Aliased to accent for the Yodl contract. Never referenced by app code. */
  info: '#2A2FD6',
} as const;

/** Ink. A real second design, not an inversion of the first. */
export const dark = {
  bgDeep: '#100E0B',
  bg: INK,
  surface: INK_RAISED,
  surfaceHover: '#2E2B27',
  surfaceSecondary: '#322E29',
  skeleton: '#2A2723',

  /** Yodl WebView theme only. */
  border: '#35312B',
  /** Yodl WebView theme only. */
  borderStrong: '#4A453D',

  /** 15.70:1 on Ink, 13.85:1 on the raised surface. Also the CTA fill in dark. */
  text: PAPER,
  /** Slate. 7.00:1 on Ink, 5.32:1 on the inset fill. */
  textSecondary: '#A9A296',
  /** 6.18:1 on Ink, 4.70:1 on the inset fill. */
  textMuted: '#9E988B',

  /** Ultramarine, lifted for a dark ground. 6.34:1 on Ink, 4.82:1 on inset. */
  accent: '#8A90FF',
  accentStrong: '#A9AEFF',
  accentDeep: '#5A60E0',

  success: '#58C98D',
  warning: '#E0A63C',
  /** 7.72:1 on Ink, 6.81:1 on the raised surface. */
  error: '#FF8A75',
  info: '#8A90FF',
} as const;

export type ColorScheme = 'light' | 'dark';

/** Both modes keyed by scheme, for `palette[useColorScheme() ?? 'light']`. */
export const palette = { light, dark } as const;

/**
 * The brand shell — the hosted Yodl pay surface and its sheets.
 *
 * Mode-invariant on purpose, and the invariance is doing real work here. Aiming
 * at a QR and paying for it are the two moments the phone is raised at a stall,
 * and both are dark: the scanner is Ink over camera in *both* schemes, and the
 * hosted pay surface is Ink behind it. In dark mode the handoff is seamless; in
 * light mode it is the app's single designed luminance boundary, crossed twice.
 *
 * `sheet` is the same hex as `dark.surface`, so a sheet inside the hosted UI and
 * one of our cards are literally the same object.
 */
export const brand = {
  surface: INK,
  sheet: INK_RAISED,
} as const;
