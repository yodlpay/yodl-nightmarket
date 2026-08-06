/**
 * The shell every dead-end screen in the app shares.
 *
 * A gate is a screen that exists because something is missing or something
 * stopped: no wallet yet, no camera permission, a QR that isn't a Yodl code, a
 * hosted flow that errored out. All of them are the same shape — an inset icon
 * tile, a caption, one sentence of title, one paragraph of explanation, and a
 * single way forward.
 *
 * Bottom-anchored, like sign-in. The copy sits on top of the fold and the action
 * lands in the thumb arc, which is where a phone that is *not* currently raised
 * at a stall is actually held. Every gate in the app is a screen you reach with
 * the phone down.
 *
 * There is no accent anywhere on a gate, and that is the rule rather than an
 * omission — Ultramarine means "this money has settled", and no gate has money
 * on it.
 *
 * It lives here rather than in the scanner because the two camera gates, the
 * three hosted-WebView fallbacks and anything that follows them have to be one
 * layout. Three restyled copies of the same screen is how an app ends up with
 * two mutually exclusive error designs and a CTA nobody's thumb reaches.
 */

import { radius, space } from '@nightmarket/theme';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from './Screen';
import { Txt } from './Txt';
import { useColors } from './theme';

export interface GateProps {
  /** Drawn on an inset tile. Decorative — the copy carries the meaning. */
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  /** One `<Button>`, or a fragment when a gate genuinely has a second way out. */
  action: ReactNode;
  /** Sits under the action: an error message, or a line of instructions. */
  note?: ReactNode;
}

export function Gate({ icon, eyebrow, title, body, action, note }: GateProps) {
  const colors = useColors();

  return (
    <Screen>
      <View style={styles.gate}>
        <View style={styles.gateCopy}>
          <View style={[styles.gateIcon, { backgroundColor: colors.surfaceSecondary }]}>
            {icon}
          </View>
          <View style={styles.gateText}>
            <Txt variant="caption" tone="muted">
              {eyebrow}
            </Txt>
            <Txt variant="title">{title}</Txt>
            <Txt variant="body" tone="secondary" style={styles.measure}>
              {body}
            </Txt>
          </View>
        </View>

        <View style={styles.gateActions}>
          {action}
          {note}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1 },
  gateCopy: { flex: 1, justifyContent: 'flex-end', gap: space.xl },
  gateText: { gap: space.sm },
  /** An inset tile: elevation stepping *toward* the ground, as a field does. */
  gateIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** One line length, shared with sign-in's hero paragraph. */
  measure: { maxWidth: 320 },
  gateActions: { gap: space.md, paddingTop: space.xxl, paddingBottom: space.lg },
});
