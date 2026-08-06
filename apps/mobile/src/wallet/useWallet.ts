/**
 * Privy's embedded wallet, in the shape `<YodlProvider>` wants.
 *
 * Yodl asks for three things — an EIP-1193 provider, the connected address, and
 * the chain id — and the docs are emphatic that the last two must be the wallet's
 * *live* values, not constants captured once:
 *
 *   "The SDK pushes `accountsChanged` and `chainChanged` into the hosted UI as
 *    they change, so a stale `chainId` leaves the UI on the wrong chain."
 *
 * Privy gives us the provider through an async `getProvider()` and the chain id
 * only over RPC, so this hook is the small amount of glue that turns that into
 * something renderable. It subscribes to the provider's own events rather than
 * re-reading on an interval — the provider is the source of truth, and polling it
 * would still be a frame behind on the render that matters.
 *
 * ── Nobody creates a wallet by hand any more ──────────────────────────────────
 *
 * There used to be a `create()` here, an `isCreating` flag beside it, a
 * `needsWallet` boolean, and a full screen in the scanner asking the user to
 * press a button captioned "Create my wallet" — for an account they had just
 * created, holding a key they will never see, in an app whose entire premise is
 * that there is nothing to set up.
 *
 * Privy provisions it at login instead: `config.embedded.ethereum.createOnLogin`
 * in `app/_layout.tsx`. That setting reaches the core SDK through every login
 * path this app can take, and the wallet arrives with the user object.
 *
 * The effect below is the one case that setting cannot reach: a session that was
 * already signed in before the config existed never logs in again, so nothing
 * ever provisions it. It asks once per user and only when Privy says there is
 * none — `create()` without `createAdditional` is a no-op for a user who already
 * has one, but the guard means we don't call it to find that out.
 */

import { getUserEmbeddedEthereumWallet, useEmbeddedEthereumWallet, usePrivy } from '@privy-io/expo';
import type { EIP1193Provider } from '@yodlpay/react-native';
import { useEffect, useRef, useState } from 'react';
import { hexToNumber, isHex } from 'viem';

export interface WalletState {
  /** Signing and RPC transport. `null` until Privy hands it over. */
  provider: EIP1193Provider | null;
  address: string | null;
  chainId: number | null;
  /** All three present. Anything less and the Yodl components can't be mounted. */
  isConnected: boolean;
  /**
   * Provisioning or the provider handover failed. Rare, and terminal for the
   * screen that hits it: without a wallet there is nothing to pay with, so
   * `YodlHost` renders this rather than a spinner that never resolves.
   */
  error: Error | null;
}

/**
 * `eth_chainId` answers with a hex quantity; `<YodlProvider>` wants a number.
 *
 * viem's `hexToNumber` is the RPC-shaped half of this — it is strict about the
 * `0x` prefix and throws rather than guessing, which is why the call is wrapped.
 * A provider that answers with a decimal string or a number is out of spec but
 * not worth dropping the wallet over, so those are still read directly.
 */
const toChainId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  if (isHex(value)) {
    try {
      return hexToNumber(value);
    } catch {
      return null;
    }
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export function useWallet(): WalletState {
  const { user } = usePrivy();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const wallet = wallets[0];

  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!wallet) {
      setProvider(null);
      setAddress(null);
      setChainId(null);
      return;
    }

    // `cancelled` matters here: getProvider() is async and the effect can be torn
    // down mid-flight (logout, wallet switch). Without the guard a resolved
    // promise from the previous wallet writes its provider over the current one.
    let cancelled = false;
    let active: EIP1193Provider | null = null;
    const onChainChanged = (next: unknown) => setChainId(toChainId(next));
    const onAccountsChanged = (accounts: unknown) => {
      const [first] = Array.isArray(accounts) ? accounts : [];
      setAddress(typeof first === 'string' ? first : null);
    };

    void (async () => {
      try {
        const next = await wallet.getProvider();
        if (cancelled) return;

        active = next as unknown as EIP1193Provider;
        setProvider(active);
        setAddress(wallet.address);

        const current = await next.request({ method: 'eth_chainId' });
        if (cancelled) return;
        setChainId(toChainId(current));

        // Privy's provider is a full EIP-1193 emitter. Typed loosely because the
        // Yodl-facing `EIP1193Provider` only declares `request` — it uses the
        // provider purely as transport and does not need the event surface.
        next.on('chainChanged', onChainChanged);
        next.on('accountsChanged', onAccountsChanged);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    })();

    return () => {
      cancelled = true;
      const emitter = active as unknown as {
        removeListener?: (event: string, listener: (...args: never[]) => void) => void;
      } | null;
      emitter?.removeListener?.('chainChanged', onChainChanged as never);
      emitter?.removeListener?.('accountsChanged', onAccountsChanged as never);
    };
  }, [wallet]);

  /**
   * The backstop for a session that predates `createOnLogin`.
   *
   * Asked of the *user object* rather than of `wallets`, and that is the part
   * that matters: `getUserEmbeddedEthereumWallet` is the same check Privy's own
   * login-time provisioning runs, and a login resolves only after that has
   * finished — so a user who reaches this effect without a linked wallet is one
   * the setting never got to, not one whose wallet is still in flight. Reading
   * `wallets` instead would fire during that window and race Privy's own create.
   *
   * Keyed on the user id rather than a boolean: signing out and back in as
   * somebody else is a different question, and a flag that only flips once would
   * leave the second account without a wallet and nothing to ask again with.
   */
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!user || getUserEmbeddedEthereumWallet(user) || asked.current === user.id) return;
    asked.current = user.id;
    create().catch((cause) => setError(cause instanceof Error ? cause : new Error(String(cause))));
  }, [user, create]);

  return {
    provider,
    address,
    chainId,
    isConnected: provider !== null && address !== null && chainId !== null,
    error,
  };
}
