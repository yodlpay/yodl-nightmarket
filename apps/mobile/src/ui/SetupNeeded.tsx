/**
 * What the app shows when its environment isn't filled in yet.
 *
 * This exists because the alternative is a red box. `src/env.ts` used to throw on
 * a missing variable, which is correct in spirit — fail loudly — but in an Expo
 * app a module-level throw lands before the first frame, so the user gets a stack
 * trace pointing at `env.ts` and no indication of which variable, why it matters,
 * or where to get it.
 *
 * The same information, rendered: the names, in the order to deal with them, and
 * the two commands that fix them.
 *
 * There is no accent anywhere on this screen, and that is the rule rather than an
 * omission — Ultramarine means "this money has settled", and there is no money
 * here. The numbered steps are counted in Slate on an inset square; the variable
 * names and shell commands are the only DM Mono on the screen, which is exactly
 * what mono is still for.
 */

import { radius, space } from '@nightmarket/theme';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { MissingVariable } from '~/env';
import { Card } from './Card';
import { Screen } from './Screen';
import { Txt } from './Txt';
import { useColors } from './theme';

export function SetupNeeded({ missing }: { missing: MissingVariable[] }) {
  const colors = useColors();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brand}>
          <Txt variant="caption" tone="muted">
            Nightmarket · setup
          </Txt>
          <Txt variant="title">Almost there</Txt>
          <Txt variant="body" tone="secondary" style={styles.measure}>
            The app built and installed fine. It just needs {missing.length} value
            {missing.length === 1 ? '' : 's'} before it can sign you in and take a payment.
          </Txt>
        </View>

        <View style={{ gap: space.md }}>
          {missing.map((item, index) => (
            <Card key={item.name} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.number, { backgroundColor: colors.surfaceSecondary }]}>
                  <Txt variant="caption" tone="secondary">
                    {index + 1}
                  </Txt>
                </View>
                <Txt variant="mono" style={styles.name}>
                  {item.name}
                </Txt>
              </View>
              <Txt variant="small" tone="secondary">
                {item.why}
              </Txt>
              <Txt variant="mono" tone="muted">
                {item.where}
              </Txt>
            </Card>
          ))}
        </View>

        <View style={{ gap: space.sm }}>
          <Txt variant="caption" tone="muted">
            How to fix
          </Txt>
          <Card tone="inset" style={styles.card}>
            <Txt variant="small" tone="secondary">
              Edit them in
            </Txt>
            <Txt variant="mono">apps/mobile/.env</Txt>
            <Txt variant="small" tone="secondary" style={{ marginTop: space.sm }}>
              then restart the bundler — these are compiled into the bundle, so a running Metro will
              not pick up the change:
            </Txt>
            <Txt variant="mono">pnpm dev:mobile</Txt>
          </Card>
        </View>

        <Txt variant="small" tone="muted" style={styles.measure}>
          Reloading the app is not enough on its own. Stop Metro, start it again, and the new values
          are inlined on the next bundle.
        </Txt>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Top-anchored, unlike sign-in's bottom-anchored column: this screen is a
  // document that can outgrow the viewport, and there is nothing here for a
  // thumb to reach. What the two share is the block rhythm — a `space.xxl`
  // gutter, `space.xl` between sections, and the same caption / heading /
  // paragraph triplet at the top on the same internal gap.
  content: { gap: space.xl, paddingVertical: space.xxl },
  brand: { gap: space.md },
  /** Same measure as sign-in's hero paragraph, so both read at one line length. */
  measure: { maxWidth: 320 },
  card: { gap: space.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  name: { flex: 1 },
  /** An inset square inside a raised card — elevation stepping back toward the ground. */
  number: {
    width: 24,
    height: 24,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
