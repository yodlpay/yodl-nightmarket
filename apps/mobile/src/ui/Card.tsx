/**
 * A surface. No edge.
 *
 * The old card was a hairline outline around a fill that sat a couple of percent
 * off the background — the border was doing all the separating, and an app where
 * every card, chip and badge is outlined reads as a 2019 dark theme no matter
 * what colours you pour into it. `surface` now sits a real step off `bg` (about
 * 1.13 in both schemes, which is the step Phantom and Mercury use) and the fill
 * separates on its own. `borderWidth` does not appear in this file and must not
 * appear anywhere else in the app.
 *
 * Elevation is *directional*, which is the whole system in one sentence:
 *
 *   `raised`   steps AWAY from the ground — a card, a day group, the CTA scrim.
 *   `inset`    steps TOWARD it — a field, an OTP box, a tile, a quiet button.
 *   `inverted` runs against the scheme entirely: Ink on Paper, Paper on Ink.
 *
 * A card and a text field are opposite moves and must never share a fill.
 *
 * `inverted` exists for exactly one object app-wide — the wallet card. It is the
 * one thing the user owns, it carries the hero numeral, and flipping it per mode
 * is what keeps the light and dark builds recognisably the same design rather
 * than two themes. Text on it takes `<Txt tone="inverted">`.
 *
 * `lifted` is the app's only shadow: neutral, soft, and **light mode only**. On a
 * near-black ground a shadow is invisible, which is exactly why dark UIs separate
 * by fill and light UIs separate by shadow — so in dark mode `lifted` is silently
 * a no-op rather than a grey smudge. Two objects may set it: the wallet card and
 * the floating CTA bar.
 */

import { lift, radius, space } from '@nightmarket/theme';
import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { useColors, useScheme } from './theme';

export interface CardProps {
  children: ReactNode;
  /** Which direction this surface steps. Defaults to raised. */
  tone?: 'raised' | 'inset' | 'inverted';
  /** The neutral drop shadow. Light mode only; ignored in dark. */
  lifted?: boolean;
  onPress?: () => void;
  /** Required when `onPress` is set — a surface that acts needs a name. */
  accessibilityLabel?: string;
  style?: ViewStyle;
  padded?: boolean;
}

export function Card({
  children,
  tone = 'raised',
  lifted = false,
  onPress,
  accessibilityLabel,
  style,
  padded = true,
}: CardProps) {
  const colors = useColors();
  const scheme = useScheme();

  const fill: Record<NonNullable<CardProps['tone']>, string> = {
    raised: colors.surface,
    inset: colors.surfaceSecondary,
    // The ground of the *other* scheme. One token, both directions.
    inverted: colors.text,
  };

  const base: ViewStyle = {
    backgroundColor: fill[tone],
    borderRadius: radius.card,
    padding: padded ? space.lg : 0,
    ...(lifted && scheme === 'light' ? lift : null),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        base,
        // A fill change, not a scale-and-glow. `surfaceHover` is the pressed
        // state for every Pressable surface in the app; an inverted card has no
        // hover fill of its own, so it dims by opacity instead.
        pressed
          ? tone === 'inverted'
            ? { opacity: 0.88 }
            : { backgroundColor: colors.surfaceHover }
          : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
