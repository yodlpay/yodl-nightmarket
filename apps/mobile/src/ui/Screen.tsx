/**
 * The screen shell: background, safe area, gutters. That is all it is now.
 *
 * The two-layer magenta-and-lime `Haze` that used to sit over every screen is
 * gone, along with the `expo-linear-gradient` import that fed it. Gradient
 * atmosphere over a dark UI is the single most legible period marker in the old
 * design — it is what a 2019 crypto app looked like, and no amount of recolouring
 * survives it. The ground is a flat fill in both schemes, and the interest comes
 * from the type and the one drawn mark, not from the wallpaper.
 *
 * (`expo-linear-gradient` stays in package.json, unused. Removing a native
 * dependency is a prebuild, not a paint job.)
 *
 * Every screen in the app renders on `bg` — sign-in, activity, both scanner
 * gates, the WebView fallbacks. The one exception is the scanner itself, which is
 * Ink over the camera feed in *both* schemes and does not use this component's
 * background at all.
 */

import { space } from '@nightmarket/theme';
import type { ReactNode } from 'react';
import { type ScrollViewProps, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';

export interface ScreenProps {
  /** Optional so `<Screen />` works as a plain themed backdrop while something loads. */
  children?: ReactNode;
  /** Set false for full-bleed screens: the camera, and the hosted Yodl surfaces. */
  padded?: boolean;
  /** Set false where the content owns the top edge (a WebView, a viewfinder). */
  safeTop?: boolean;
  style?: ViewStyle;
}

export function Screen({ children = null, padded = true, safeTop = true, style }: ScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }, style]}>
      <View
        style={{
          flex: 1,
          paddingTop: safeTop ? insets.top : 0,
          paddingBottom: insets.bottom,
          paddingHorizontal: padded ? space.xl : 0,
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** Standard scroll content padding, so every list ends clear of the home bar. */
export const scrollContent: ScrollViewProps['contentContainerStyle'] = {
  paddingBottom: space.xxl * 2,
  gap: space.md,
};

const styles = StyleSheet.create({
  root: { flex: 1 },
});
