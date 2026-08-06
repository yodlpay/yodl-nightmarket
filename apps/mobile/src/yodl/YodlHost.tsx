/**
 * `<YodlProvider>`, wired to Privy, with the wait states handled once.
 *
 * All three hosted surfaces need the same four things — the SDK instance, a live
 * provider, a live address and a live chain id — and all three have the same
 * problem while Privy is still resolving them: the Yodl components can't be
 * mounted with `null`s, and mounting them with placeholder values would point the
 * hosted UI at the wrong chain.
 *
 * So this renders `fallback` until the wallet is genuinely ready and only then
 * mounts the provider. Everything below it can assume a connected wallet.
 *
 * The theme is passed here rather than per component: `theme` and `themeMode` on
 * the provider are defaults for every hosted component beneath it, so payment,
 * signup and dashboard all inherit one palette and stay in step with the app
 * chrome for free.
 */

import { dark, nightmarketYodlTheme } from '@nightmarket/theme';
import { YodlProvider, type YodlTheme } from '@yodlpay/react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useWallet } from '~/wallet/useWallet';
import { sdk } from './sdk';
import { useYodl7702Provider } from './use7702Provider';

/**
 * The one place the shared palette meets the SDK's real type.
 *
 * `packages/theme` declares its own structural mirror of `YodlTheme` so it can
 * stay dependency-free; this annotation is what makes that safe. If the SDK's
 * token contract ever changes, the error lands here rather than at runtime as a
 * theme that silently falls back to stock Yodl.
 */
const theme: YodlTheme = nightmarketYodlTheme;

export function YodlHost({
  children,
  fallback,
}: {
  children: (wallet: { address: string; chainId: number }) => ReactNode;
  fallback?: ReactNode;
}) {
  const { provider, address, chainId, isConnected, error } = useWallet();

  // The wrapper goes on here rather than in `useWallet` because it is a Yodl
  // concern, not a Privy one: it exists solely so the hosted UI's EIP-5792 batch
  // can execute. The balance reads elsewhere in the app use the raw Privy
  // provider from `useWallet` and have no business behind a batching shim.
  const yodlProvider = useYodl7702Provider(provider);

  if (!isConnected || !yodlProvider || !address || chainId === null) {
    return (
      fallback ?? (
        <View
          style={{
            flex: 1,
            backgroundColor: dark.bg,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          {/*
            A wallet that failed to provision never arrives, so a spinner here is
            a lie that lasts forever. It is the only place that failure can be
            seen now that no screen asks anyone to create a wallet by hand — and
            the message is Privy's own, which names the cause.
          */}
          {error ? (
            <Text style={{ color: dark.error, textAlign: 'center' }}>{error.message}</Text>
          ) : (
            <ActivityIndicator color={dark.accent} />
          )}
        </View>
      )
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
