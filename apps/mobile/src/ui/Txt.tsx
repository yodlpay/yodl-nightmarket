/**
 * One text component, so the type scale is the only way to set type.
 *
 * `variant` picks a complete entry from the scale — family, size, line height and
 * tracking together — because those four are a single decision and splitting them
 * across props is how a design system becomes a suggestion. `tone` picks from the
 * palette by role, not by colour name.
 *
 * There is no `caps` prop, deliberately. Nothing in the app is uppercase, and
 * leaving the prop in place would guarantee the uppercase wide-tracked eyebrow
 * came back. Day-group headers, tile labels and timestamps are sentence-case
 * `caption` in Slate.
 *
 * `tone` is also narrower than it used to be. `success`, `warning` and `info`
 * exist in the palette only to feed the hosted Yodl theme and are not offered
 * here: status in this app is a *word* in Slate plus a lit or unlit settlement
 * mark, and `error` is the only status hue the app draws.
 *
 * Named `Txt` rather than `Text` on purpose: importing a custom `Text` that
 * shadows React Native's is the kind of thing that reads fine until someone adds
 * `import { Text } from 'react-native'` to the same file.
 */

import { typography } from '@nightmarket/theme';
import type { ReactNode } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { useColors } from './theme';

type Variant = keyof typeof typography;

/**
 * `inverted` is for text sitting on a surface that runs against its scheme — the
 * primary CTA pill and the wallet card, which are the only two inverted objects
 * in the app. It resolves to the *ground*, so Paper-on-Ink in light mode and
 * Ink-on-Paper in dark.
 */
type Tone = 'primary' | 'secondary' | 'muted' | 'accent' | 'error' | 'inverted';

export interface TxtProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  children?: ReactNode;
}

export function Txt({ variant = 'body', tone = 'primary', style, children, ...rest }: TxtProps) {
  const colors = useColors();

  const color: Record<Tone, string> = {
    primary: colors.text,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    // Ultramarine, and it means one thing: this money has landed. Reserved for
    // the settlement mark and a focused field's ring — never a label, never a
    // link, never an eyebrow.
    accent: colors.accent,
    error: colors.error,
    inverted: colors.bg,
  };

  const base: TextStyle = {
    ...typography[variant],
    color: color[tone],
  };

  return (
    <Text {...rest} style={[base, style]}>
      {children}
    </Text>
  );
}
