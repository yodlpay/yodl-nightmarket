/**
 * What the user looks at while a hosted Yodl surface comes up — the wallet it
 * needs, then the page itself — and what they get instead if the wallet never
 * arrives at all.
 *
 * One component for both, because they are one uninterrupted pause to the user.
 * It is half of a treatment rather than a screen: it draws no ground of its own,
 * since `YodlHost` and the SDK's overlay both sit it on the same Ink the
 * miniapp's first real frame paints.
 *
 * A mark and a line rather than a placeholder shaped like the content, which is
 * what this app reaches for everywhere else — the amount pad is not the only
 * thing that can arrive, since a wallet with no Yodl account lands on Yodl's
 * connect screen instead. Still not a spinner: nothing here moves, which matters
 * most in the error case, where a wallet that failed to provision never arrives
 * and an animation would be a lie that lasts forever. The message is Privy's
 * own, which names the cause.
 *
 * Colours come from `dark` rather than `useColors()`, the same reach `YodlHost`
 * makes: the ground is Ink in both schemes, and the light scheme's Slate would
 * sit at about 2:1 against it.
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
      {/* Not a step sequence: we cannot observe which stage the boot is in, and
          claiming progress we can't see is worse than claiming none. */}
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
