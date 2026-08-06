/**
 * The Nightmarket palette, expressed as a Yodl theme.
 *
 * The hosted Yodl UI renders in a WebView the app can't style, so it takes a
 * palette instead. Building it from the same `palette` the React Native chrome
 * uses is the whole point: the handoff from our scan screen into Yodl's payment
 * screen should not look like a handoff.
 *
 * This file is the *only* consumer of the `border` and `borderStrong` tokens.
 * `borderWidth` is banned in `apps/mobile` — separation there is a fill step or
 * it is whitespace — but the hosted UI draws its own edges and asks for the
 * value, so the tokens live on in the palette purely to be handed over here.
 * Nothing under `apps/mobile` may import them.
 *
 * Contract: https://docs.yodl.me/sdk/react-native/theming
 */

import { brand, dark, light } from './palette';

/**
 * Structural mirror of `YodlTheme` from `@yodlpay/react-native`.
 *
 * Declared here rather than imported so this package stays dependency-free (the
 * API and any future web surface can read the palette without pulling in a React
 * Native SDK). The object is still checked against the real type where it is
 * handed to `<YodlProvider>`, so a drift in the SDK contract fails there.
 */
export interface YodlThemeTokens {
  bg?: string;
  surface?: string;
  surfaceSecondary?: string;
  text?: string;
  textSecondary?: string;
  textMuted?: string;
  border?: string;
  success?: string;
  error?: string;
  warning?: string;
  accent?: string;
  bgDeep?: string;
  surfaceHover?: string;
  skeleton?: string;
  accentStrong?: string;
  accentDeep?: string;
  brandSurface?: string;
  brandSheet?: string;
  brandText?: string;
  brandButton?: string;
  brandButtonText?: string;
}

export interface YodlThemeImages {
  payBackground?: string;
  processing?: string;
  loading?: string;
}

export interface YodlThemeShape {
  name?: string;
  light?: YodlThemeTokens;
  dark?: YodlThemeTokens;
  images?: { light?: YodlThemeImages; dark?: YodlThemeImages };
}

/**
 * Note what is *not* set here: `brandText`, `brandButton` and `brandButtonText`.
 *
 * The hosted runtime derives all three from `brandSurface` by contrast, and
 * overriding them by hand can only lower the contrast it would have picked. The
 * docs are explicit about this — set the surface, look at it, and only reach for
 * the rest if a specific colour is genuinely required.
 *
 * `brandSurface` and `brandSheet` are also mode-invariant: a value set in one
 * mode mirrors into the other. They appear under `dark` only, and the light
 * palette inherits them — which is exactly what we want, because the hosted pay
 * surface is Ink in *both* schemes. Aiming at a QR and paying for it are the two
 * moments the phone is raised at a stall, and the app is dark for both: the
 * scanner is Ink over camera, and the hosted surface behind it is the same room.
 * In light mode that is the app's single designed luminance boundary, and
 * `brandSheet` is the same hex as `dark.surface`, so a sheet inside the hosted UI
 * and one of our cards are literally the same object.
 */
export const nightmarketYodlTheme: YodlThemeShape = {
  name: 'nightmarket',

  dark: {
    bg: dark.bg,
    bgDeep: dark.bgDeep,
    surface: dark.surface,
    surfaceHover: dark.surfaceHover,
    surfaceSecondary: dark.surfaceSecondary,
    skeleton: dark.skeleton,
    border: dark.border,

    text: dark.text,
    textSecondary: dark.textSecondary,
    textMuted: dark.textMuted,

    accent: dark.accent,
    accentStrong: dark.accentStrong,
    accentDeep: dark.accentDeep,

    success: dark.success,
    warning: dark.warning,
    error: dark.error,

    brandSurface: brand.surface,
    brandSheet: brand.sheet,
  },

  light: {
    bg: light.bg,
    bgDeep: light.bgDeep,
    surface: light.surface,
    surfaceHover: light.surfaceHover,
    surfaceSecondary: light.surfaceSecondary,
    skeleton: light.skeleton,
    border: light.border,

    text: light.text,
    textSecondary: light.textSecondary,
    textMuted: light.textMuted,

    accent: light.accent,
    accentStrong: light.accentStrong,
    accentDeep: light.accentDeep,

    success: light.success,
    warning: light.warning,
    error: light.error,
  },

  // `images` is left off deliberately. The slots take hosted https URLs — an
  // .mp4 loops as video, anything else renders as an <img>, and a URL that
  // isn't really an image fails silently as a broken image. Point these at a
  // CDN you control once you have one:
  //
  // images: {
  //   dark: { loading: 'https://cdn.example.com/nightmarket-loading-dark.mp4' },
  //   light: { loading: 'https://cdn.example.com/nightmarket-loading-light.mp4' },
  // },
};
