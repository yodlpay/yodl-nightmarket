/**
 * Sign in — email, then a six-digit code.
 *
 * Openfort's `useEmailAuthOtp` is a two-call flow — `requestEmailOtp`, then
 * `signInEmailOtp` — reporting four booleans and an error. Which of the two calls
 * those booleans belong to is the screen's own business, so `step` is local state
 * here rather than something read back out of the SDK. Three things it does
 * deliberately:
 *
 *  - **One field visible at a time.** The email field is replaced by the code
 *    field rather than joined by it. A form showing an empty code box next to a
 *    filled email box invites people to type the code before it has been sent.
 *  - **The error is Openfort's, not ours.** A wrong code, a rate limit and a dead
 *    network are different problems with different fixes, and flattening them to
 *    "Something went wrong" removes the only information the user could act on.
 *  - **The code is six slots, not a text box.** Every reference treats code entry
 *    as a designed moment, and the reason is legible: six cells tell you how many
 *    digits are expected, how many you have typed and which one is next, without
 *    a word of instruction. The cells are a drawing; a single transparent
 *    `TextInput` lies across them and owns the keyboard, the autofill and the
 *    accessible name, so there is still exactly one field here.
 *
 * There is no accent on this screen except the focus ring, and that is the rule
 * rather than an omission: Ultramarine means "this money has settled" and nothing
 * has settled at sign-in. The ring is the one other place it is allowed, because
 * it is a transient state rather than a permanent mark, and it is also the only
 * `borderWidth` in the file — it is drawn as an absolutely-positioned overlay so
 * appearing and disappearing cannot jog the text inside it by two points.
 */

import { radius, space, typography } from '@nightmarket/theme';
import { useEmailAuthOtp } from '@openfort/react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Button } from '~/ui/Button';
import { IconFinder } from '~/ui/Icon';
import { Screen } from '~/ui/Screen';
import { Txt } from '~/ui/Txt';
import { useColors } from '~/ui/theme';

/** Six slots, drawn once and read twice — for the cells and for the digits. */
const SLOTS = [0, 1, 2, 3, 4, 5];

export default function SignIn() {
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  /** Which half of the flow is on screen. Advanced by a sent code, never by a render. */
  const [step, setStep] = useState<'email' | 'code'>('email');
  /** Which field owns the keyboard. Drives the ring, and nothing else. */
  const [focused, setFocused] = useState<'email' | 'code' | null>(null);

  const { requestEmailOtp, signInEmailOtp, isLoading, error, reset } = useEmailAuthOtp();

  // One `isLoading` covers both calls, and only one of them can be in flight —
  // the step it belongs to is the step we are on.
  const sending = isLoading && step === 'email';
  const submitting = isLoading && step === 'code';

  /** The slot the next digit lands in. Reads as the caret, without animating one. */
  const caret = Math.min(code.length, SLOTS.length - 1);

  const ring = [styles.ring, { borderColor: colors.accent }];

  return (
    <Screen>
      {/*
        This screen is one bottom-anchored column — brand and form as a single
        mass in the thumb arc, with the leftover height left as headroom above
        the wordmark — so the keyboard has to *compress* the layout, not scroll
        it. An aware-scroll-view scrolls the focused field into view, which here
        would slide the brand off the top while the button below the field stays
        under the keys: worse than doing nothing.

        `KeyboardAvoidingView` with `behavior="padding"` shrinks the box instead.
        `flex-end` then spends that compression on the headroom above the brand
        first, so the form — field, button and all — lifts as one unit and the
        brand slides up out of the way rather than being pushed around it.

        This is the package's version, not React Native's. The built-in one needs
        a different `behavior` per platform and, because the app is edge-to-edge,
        does nothing at all on Android, where the window no longer resizes for
        the keyboard.

        The ScrollView inside is the safety net: on a short screen the compressed
        box may be smaller than the content, and then it scrolls rather than
        clipping.
      */}
      <KeyboardAvoidingView behavior="padding" style={styles.scroll}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <View style={styles.brand}>
            <Txt variant="caption" tone="muted">
              Yodl · QR payments
            </Txt>
            {/*
              The finder pattern beside the wordmark. It is the geometry printed
              in the corner of every QR code in the world, so it says what this
              app does before the paragraph underneath gets a chance to.
            */}
            <View style={styles.mark}>
              <IconFinder size={20} color={colors.text} />
              <Txt variant="display">Nightmarket</Txt>
            </View>
            <Txt variant="body" tone="secondary" style={styles.measure}>
              Scan any merchant QR in São Paulo, Buenos Aires, Hanoi or Manila. Pay with whatever
              token you're holding.
            </Txt>
          </View>

          <View style={styles.form}>
            {step === 'code' ? (
              <>
                <Txt variant="small" tone="secondary">
                  We sent a six-digit code to {email}
                </Txt>

                <View style={styles.slots}>
                  {/*
                    The cells are decoration in the accessibility tree — six
                    separate "3" nodes would be read as six controls. The input
                    lying on top of them carries the name and the value.
                  */}
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.slotRow}
                  >
                    {SLOTS.map((slot) => (
                      <View
                        key={slot}
                        style={[styles.slot, { backgroundColor: colors.surfaceSecondary }]}
                      >
                        <Txt variant="code" style={styles.digit}>
                          {code[slot] ?? ''}
                        </Txt>
                        {focused === 'code' && slot === caret ? (
                          <View pointerEvents="none" style={ring} />
                        ) : null}
                      </View>
                    ))}
                  </View>
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    onFocus={() => setFocused('code')}
                    onBlur={() => setFocused(null)}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    autoFocus
                    caretHidden
                    maxLength={6}
                    accessibilityLabel="Six-digit code"
                    // Transparent, full-bleed, and on top: the tap target is the
                    // whole row of slots, the keyboard and the SMS autofill are
                    // the platform's own, and the cells below never have to know
                    // any of that happened.
                    style={[StyleSheet.absoluteFill, styles.hidden]}
                  />
                </View>

                <Button
                  label="Enter the market"
                  loading={submitting}
                  disabled={code.length < 6}
                  onPress={() =>
                    void signInEmailOtp({
                      email,
                      otp: code,
                      // These calls resolve with `{ user }` or `{ error }` rather
                      // than throwing, so success is a callback and not a `then`.
                      onSuccess: () => router.replace('/(market)'),
                    })
                  }
                />
                <Button
                  label="Use a different email"
                  variant="text"
                  onPress={() => {
                    setStep('email');
                    setCode('');
                    setEmail('');
                    // The rejected-code message belongs to the code that was just
                    // abandoned; leaving it up would have it read as a verdict on
                    // the empty email field underneath it.
                    reset();
                  }}
                />
              </>
            ) : (
              <>
                <Txt variant="caption" tone="muted">
                  Email
                </Txt>
                <View style={[styles.field, { backgroundColor: colors.surfaceSecondary }]}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocused('email')}
                    onBlur={() => setFocused(null)}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textMuted}
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    accessibilityLabel="Email address"
                    style={[styles.fieldText, { color: colors.text }]}
                  />
                  {focused === 'email' ? <View pointerEvents="none" style={ring} /> : null}
                </View>
                <Button
                  label="Send code"
                  loading={sending}
                  disabled={!email.includes('@')}
                  onPress={() => void requestEmailOtp({ email, onSuccess: () => setStep('code') })}
                />
              </>
            )}

            {/*
              Announced when it arrives rather than only on the next swipe — a
              rejected code is the one thing on this screen a user is waiting to
              hear about.
            */}
            <View accessibilityLiveRegion="polite">
              {error ? (
                <Txt variant="small" tone="error">
                  {error.message}
                </Txt>
              ) : null}
            </View>

            <Txt variant="small" tone="muted" style={{ marginTop: space.sm }}>
              Openfort creates an embedded wallet for you on first sign-in. No seed phrase to write
              down, no extension to install.
            </Txt>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  // Layout lives here, not on `style`. A ScrollView refuses layout props on its
  // own style — `justifyContent` there throws "ScrollView child layout must be
  // applied through the contentContainerStyle prop", because the two describe
  // different boxes: `style` is the viewport, this is the content inside it.
  //
  // `flexGrow: 1` rather than `flex: 1`: it makes the content *at least* as tall
  // as the viewport, which is what gives `flex-end` slack to push against, while
  // still letting it grow past that and scroll if the keyboard squeezes the
  // viewport smaller than the content needs.
  //
  // `flex-end` rather than `space-between`, which is what left the dead void:
  // two children at opposite ends means every spare pixel is dumped *between*
  // the brand and the form — a hole in the middle of the two things that belong
  // to each other. Anchoring the pair to the bottom and giving them a known
  // `space.xxl` gap turns that slack into deliberate headroom above the
  // wordmark: a poster with a margin instead of a form with a hole.
  content: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingVertical: space.xxl,
    gap: space.xxl,
  },
  // `md`, not `sm`: now that the eyebrow, wordmark and paragraph are one mass
  // rather than a block stranded at the top, they need internal rhythm of their
  // own.
  brand: { gap: space.md },
  mark: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  /** Line length for hero copy. Shared with `SetupNeeded`, the other poster screen. */
  measure: { maxWidth: 320 },
  form: { gap: space.md },

  /**
   * Inset, not raised: a field steps *toward* the ground while a card steps away
   * from it, and that opposition is the whole elevation system. No border — the
   * fill is the edge.
   */
  field: { height: 56, borderRadius: radius.control, justifyContent: 'center' },
  fieldText: { ...typography.body, paddingHorizontal: space.lg, height: '100%' },

  slots: { height: 60 },
  slotRow: { flexDirection: 'row', gap: space.sm },
  slot: {
    flex: 1,
    height: 60,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * `code` carries +6 tracking so that six digits inside one box read as six
   * digits. Here each digit stands alone in its own cell, and that trailing
   * sixth of a point would simply push it off centre.
   */
  digit: { letterSpacing: 0 },
  hidden: { opacity: 0 },

  /**
   * The only `borderWidth` in the file, and it is a state rather than a
   * structure: 2pt of Ultramarine that exists while a field has the keyboard and
   * is gone the moment it doesn't. Drawn as an overlay so it cannot shift the
   * content it surrounds.
   */
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: radius.control,
  },
});
