/**
 * The button. Formerly `NeonButton`, and the rename is the point — `neon` was the
 * name of the thing being fixed.
 *
 * **No variant is ever the accent colour.** The old primary was a hot magenta
 * pill with a coloured glow under it; the new one carries no hue at all. Ink fill
 * with a Paper label in light mode, Paper fill with an Ink label in dark. That is
 * not timidity — it resolves a collision. With the action achromatic, Ultramarine
 * is freed to mean exactly one thing in this app (money has settled), and
 * hierarchy comes from scale and placement instead of from a coloured rectangle.
 *
 * Four variants:
 *
 *   `pill`   The primary action. One per screen, `radius.full`, 52pt, full width,
 *            in the thumb arc at the foot of the screen. It is the *only* element
 *            in the app allowed to use `radius.full`, which is what makes a pill
 *            read as the action at a glance.
 *   `tile`   A 60pt rounded square with the icon inside and a sentence-case
 *            caption beneath — the Phantom / Revolut form. Used in rows of two to
 *            four. The tile is the drawing; the whole column is the tap target.
 *   `quiet`  An inset fill with normal text on it. Secondary, in-flow actions.
 *   `text`   Bare label. Tertiary — "use a different email".
 *
 * Press feedback is a fill change plus the existing haptic, and a 2% scale that
 * is dropped when the device asks for reduced motion. `disabled` and `loading`
 * both stop the press but are never drawn the same way: inert gets a flat inset
 * fill with muted text ("not yet"), while loading keeps the live fill at full
 * strength, because a button that is working should look like it is working.
 */

import { radius, space, typography } from '@nightmarket/theme';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useColors } from './theme';

type Variant = 'pill' | 'tile' | 'quiet' | 'text';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  /** Rendered beside the label — or inside the square, for `tile`. */
  icon?: ReactNode;
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'pill',
  loading = false,
  icon,
  disabled,
  onPress,
  accessibilityLabel,
  style,
  ...rest
}: ButtonProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const inert = disabled === true;
  const busy = loading;

  // The inverted fill: `text` is the ground of the other scheme, so one token
  // gives Ink-on-Paper in light and Paper-on-Ink in dark without a second path.
  const fills: Record<Variant, ViewStyle> = {
    pill: { backgroundColor: colors.text },
    tile: { backgroundColor: colors.surfaceSecondary },
    quiet: { backgroundColor: colors.surfaceSecondary },
    text: { backgroundColor: 'transparent' },
  };

  const labels: Record<Variant, string> = {
    pill: colors.bg,
    tile: colors.text,
    quiet: colors.text,
    text: colors.textSecondary,
  };

  const labelColor = inert ? colors.textMuted : labels[variant];

  const press = (event: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
    // Fire and forget: a failed haptic (simulator, haptics disabled in system
    // settings) must never block the press it accompanies.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.(event);
  };

  const shared = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: accessibilityLabel ?? label,
    accessibilityState: { disabled: inert || busy, busy },
    disabled: inert || busy,
    onPress: press,
    android_ripple: { color: 'rgba(128,128,128,0.16)', borderless: false },
    unstable_pressDelay: 0,
  };

  // The tile is a square plus a caption, not a wide button with an icon in it.
  // The Pressable wraps both, so the 60pt square and its 16pt label are one
  // target well clear of the 44pt floor.
  if (variant === 'tile') {
    return (
      <Pressable {...shared} {...rest} style={[styles.tileTarget, style]}>
        {({ pressed }) => (
          <>
            <View
              style={[
                styles.tile,
                inert ? { backgroundColor: colors.surfaceSecondary } : fills.tile,
                pressed && !inert ? { backgroundColor: colors.surfaceHover } : null,
                pressed && !inert && !reduceMotion ? { transform: [{ scale: 0.98 }] } : null,
              ]}
            >
              {busy ? <ActivityIndicator size="small" color={labelColor} /> : icon}
            </View>
            <Text numberOfLines={1} style={[typography.caption, { color: labelColor }]}>
              {label}
            </Text>
          </>
        )}
      </Pressable>
    );
  }

  const pressedFill: ViewStyle =
    variant === 'pill'
      ? // An inverted fill has no hover token of its own; it dims instead.
        { opacity: 0.88 }
      : { backgroundColor: colors.surfaceHover };

  return (
    <Pressable
      {...shared}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        variant === 'pill' ? styles.pill : styles.control,
        inert ? { backgroundColor: colors.surfaceSecondary } : fills[variant],
        pressed && !inert ? pressedFill : null,
        pressed && !inert && !reduceMotion ? { transform: [{ scale: 0.98 }] } : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {busy ? (
          <ActivityIndicator size="small" color={labelColor} />
        ) : (
          <>
            {icon}
            <Text numberOfLines={1} style={[typography.bodyStrong, { color: labelColor }]}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** The one place `radius.full` is permitted. */
  pill: { height: 52, borderRadius: radius.full, alignSelf: 'stretch' },
  control: { minHeight: 44, paddingVertical: space.md, borderRadius: radius.control },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tileTarget: { alignItems: 'center', gap: space.sm },
  tile: {
    width: 60,
    height: 60,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
