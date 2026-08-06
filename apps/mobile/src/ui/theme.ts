/**
 * The palette, resolved for the device's current appearance.
 *
 * Light is the fallback, not dark. `useColorScheme()` returns `null` on some
 * Android configurations, and Paper is the mode this design was drawn in — a
 * device that can't tell us what it wants should land on the designed default
 * rather than on the second design. The only screen that ignores this entirely is
 * the scanner, which is Ink over the camera feed in both schemes.
 */

import { type ColorScheme, palette } from '@nightmarket/theme';
import { useColorScheme } from 'react-native';

export function useScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useColors() {
  return palette[useScheme()];
}

/**
 * The *other* scheme's palette, for content sitting on an inverted surface.
 *
 * Exactly one object in the app runs against its scheme: the wallet card, which
 * is Ink on Paper in light mode and Paper on Ink in dark. Anything drawn on it —
 * secondary text, a muted caption, the settlement mark — has to come from the
 * palette that was designed against that fill, not from the screen's. Reaching
 * for `colors.accent` there is the specific way this goes wrong: dark mode's
 * Ultramarine sits at 2.5:1 on a Paper card, and light mode's sits at 2.5:1 on an
 * Ink one. Both clear 6:1 the right way round.
 *
 * `<Txt tone="inverted">` already covers plain body text on such a surface; this
 * is for everything with a role.
 */
export function useInvertedColors() {
  return palette[useScheme() === 'dark' ? 'light' : 'dark'];
}

export type Colors = ReturnType<typeof useColors>;
