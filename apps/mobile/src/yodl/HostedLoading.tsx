/**
 * What the user looks at while a hosted Yodl surface comes up — the wallet it
 * needs, then the page itself — and what they get instead if the wallet never
 * arrives at all.
 *
 * One component for both because they are one wait. `YodlHost` blocks on Privy
 * resolving a provider, an address and a chain; `<YodlPayment>`'s overlay then
 * blocks on the page's first real frame. The user sees a single uninterrupted
 * pause, and drawing it twice — a spinner and then a static mark, or worse, an
 * accented spinner and then a static mark — was two treatments arguing with each
 * other across a seam nobody but us can see.
 *
 * `HostedLoading` rather than `PayLoading`: `YodlHost` also serves `/onboard`
 * and `/dashboard`, so the caption stays neutral about which surface is coming.
 * What is true on all three is that Yodl is being got ready.
 *
 * This is half of a treatment, not a screen. The SDK paints `brand.surface`
 * behind and over its WebView, the miniapp's first real frame — the amount pad —
 * paints the same Ink, and this draws the app's mark in the middle of it. The
 * seam between the native overlay and the web page is then a mark disappearing,
 * which is the whole point: what used to be four loading treatments on two
 * grounds between the scanner and the pad is one on one.
 *
 * A mark and a line rather than a placeholder shaped like the content, which is
 * what this app reaches for everywhere else. The pad is not the only thing that
 * can arrive — a wallet with no Yodl account lands on Yodl's connect screen
 * instead — so a keypad-shaped placeholder would be a promise we can't keep.
 * It is still not a spinner: nothing here moves. That matters most in the error
 * case, where a wallet that failed to provision never arrives and an animation
 * would be a lie that lasts forever. The message is Privy's own, which names the
 * cause.
 *
 * Colours come from `dark` rather than `useColors()`, the same reach `YodlHost`
 * makes and for the same reason. The ground here is Ink in both schemes; in
 * light mode this is the app's one designed luminance boundary, and the light
 * scheme's Slate would sit at about 2:1 on the far side of it. There is no
 * accent on either state, which is the rule the accented spinner this replaced
 * was breaking: Ultramarine means money has landed, and a wait is not money.
 */

import { dark, space } from '@nightmarket/theme';
import { StyleSheet, View } from 'react-native';
import { IconFinder } from '~/ui/Icon';
import { Txt } from '~/ui/Txt';

export function HostedLoading({ error }: { error?: Error | null }) {
  return (
    <View style={styles.root}>
      {/* 40pt: the mark is drawn at 20 and above by contract, and this is the
          only place it is the sole thing on screen. */}
      <IconFinder size={40} color={dark.text} />
      {/* Deliberately not a step sequence. Yodl's own loader cycles three
          captions because it knows which stage it is in; we don't, and inventing
          progress we can't observe is the thing a spinner is honest about. */}
      <Txt variant="small" style={error ? styles.error : styles.caption}>
        {error ? error.message : 'Getting Yodl ready'}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.xl },
  caption: { color: dark.textSecondary, textAlign: 'center' },
  error: { color: dark.error, textAlign: 'center' },
});
