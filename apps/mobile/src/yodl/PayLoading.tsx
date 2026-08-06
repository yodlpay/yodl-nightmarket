/**
 * What the user looks at while the hosted pay surface boots.
 *
 * This is half of one treatment, not a screen. The SDK paints `brand.surface`
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
 * It is still not a spinner: nothing here moves.
 *
 * Colours come from `dark` rather than `useColors()`, the same reach `YodlHost`
 * makes and for the same reason. The ground here is Ink in both schemes; in
 * light mode this is the app's one designed luminance boundary, and the light
 * scheme's Slate would sit at about 2:1 on the far side of it.
 */

import { dark, space } from '@nightmarket/theme';
import { StyleSheet, View } from 'react-native';
import { IconFinder } from '~/ui/Icon';
import { Txt } from '~/ui/Txt';

export function PayLoading() {
  return (
    <View style={styles.root}>
      {/* 40pt: the mark is drawn at 20 and above by contract, and this is the
          only place it is the sole thing on screen. */}
      <IconFinder size={40} color={dark.text} />
      {/* Deliberately not a step sequence. Yodl's own loader cycles three
          captions because it knows which stage it is in; we don't, and inventing
          progress we can't observe is the thing a spinner is honest about. */}
      <Txt variant="small" style={styles.caption}>
        Setting up the payment
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.xl },
  caption: { color: dark.textSecondary },
});
