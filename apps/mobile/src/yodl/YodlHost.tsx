/**
 * `<YodlProvider>`, wired to Privy, with the wait states handled once.
 *
 * All three hosted surfaces need the same four things — the SDK instance, a live
 * provider, a live address and a live chain id — and all three have the same
 * problem while Privy is still resolving them: the Yodl components can't be
 * mounted with `null`s, and mounting them with placeholder values would point the
 * hosted UI at the wrong chain.
 *
 * So this renders `HostedLoading` until the wallet is genuinely ready and only
 * then mounts the provider. Everything below it can assume a connected wallet.
 *
 * That is the same component `pay` hands the SDK as `renderLoading`: the wallet
 * wait and the hosted surface's own boot are one pause to the user.
 *
 * The theme is passed here rather than per component: `theme` and `themeMode` on
 * the provider are defaults for every hosted component beneath it, so payment,
 * signup and dashboard all inherit one palette and stay in step with the app
 * chrome for free.
 */

import { brand, nightmarketYodlTheme } from '@nightmarket/theme';
import { YodlProvider, type YodlTheme } from '@yodlpay/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useWallet } from '~/wallet/useWallet';
import { HostedLoading } from './HostedLoading';
import { sdk } from './sdk';
import { useYodl7702Provider } from './use7702Provider';

/**
 * The one place the shared palette meets the SDK's real type.
 *
 * `packages/theme` declares its own structural mirror of `YodlTheme` so it can
 * stay dependency-free; these two lines are what make that safe. If the SDK's
 * token contract ever changes, the error lands here rather than at runtime as a
 * theme that silently falls back to stock Yodl.
 *
 * The annotation alone is not enough. Excess-property checking only fires on
 * fresh object literals, so assigning an already-typed value lets a key the SDK
 * does not have through — and the hosted runtime strips unknown keys rather than
 * rejecting them, so a typo would compile, ship, and quietly do nothing. The
 * `Exclude` below fails the build instead.
 */
type ThemeKeysExistOnSdkType =
  Exclude<keyof typeof nightmarketYodlTheme, keyof YodlTheme> extends never ? true : never;
const _themeKeysAreReal: ThemeKeysExistOnSdkType = true;

const theme: YodlTheme = nightmarketYodlTheme;

export function YodlHost({
  children,
}: {
  children: (wallet: { address: string; chainId: number }) => ReactNode;
}) {
  const { provider, address, chainId, isConnected, error } = useWallet();

  // The wrapper goes on here rather than in `useWallet` because it is a Yodl
  // concern, not a Privy one: it exists solely so the hosted UI's EIP-5792 batch
  // can execute. The balance reads elsewhere in the app use the raw Privy
  // provider from `useWallet` and have no business behind a batching shim.
  const yodlProvider = useYodl7702Provider(provider);

  if (!isConnected || !yodlProvider || !address || chainId === null) {
    // A bare fill, not a padded centred box. `HostedLoading` centres its own
    // content on both axes and bleeds an ambient video to the edges, and this
    // frame used to inset it by `space.xl` and shrink it to its content width —
    // which a video ground cannot survive. This is also the only place a wallet
    // that failed to provision can be seen, now that no screen asks anyone to
    // create one.
    return (
      <View style={styles.wait}>
        <HostedLoading error={error} />
      </View>
    );
  }

  return (
    <YodlProvider
      sdk={sdk}
      provider={yodlProvider}
      address={address}
      chainId={chainId}
      theme={theme}
      // `system` rather than a pinned mode: the app follows the device, and a
      // hosted screen that stays dark inside a light app is the exact seam the
      // shared palette exists to remove.
      themeMode="system"
    >
      {children({ address, chainId })}
    </YodlProvider>
  );
}

const styles = StyleSheet.create({
  /**
   * The shell the hosted surface is about to paint, not dark mode's ground —
   * same hex, but this frame is Ink in a light-mode session too.
   */
  wait: { flex: 1, backgroundColor: brand.surface },
});
