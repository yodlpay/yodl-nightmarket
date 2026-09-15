/**
 * Openfort's embedded wallet, in the shape `<YodlProvider>` wants.
 *
 * Yodl asks for three things — an EIP-1193 provider, the connected address, and
 * the chain id — and the docs are emphatic that the last two must be the wallet's
 * *live* values, not constants captured once:
 *
 *   "The SDK pushes `accountsChanged` and `chainChanged` into the hosted UI as
 *    they change, so a stale `chainId` leaves the UI on the wrong chain."
 *
 * Two of the three arrive as a discriminated union on `status`: the provider and
 * the active wallet exist only on the `connected` variant, so the type system
 * refuses to let either be read early. The chain id is still only available over
 * RPC, so this hook reads it once and then follows the provider's own events
 * rather than re-reading on a timer — the provider is the source of truth, and
 * polling it would still be a frame behind on the render that matters.
 *
 * ── Somebody has to ask for the wallet ────────────────────────────────────────
 *
 * Openfort never creates or recovers a wallet by itself. There is no
 * create-on-login setting to turn on: `create()` mints one, `setActive()`
 * recovers the key share of one that already exists, and until an app calls one
 * of them a signed-in user simply has none. No screen here is going to ask —
 * pressing "Create my wallet" is a step with no decision in it, for an account
 * the user made a second ago, holding a key they will never see — so the effect
 * at the bottom does it once per user and says nothing about it.
 *
 * All the difficulty is in *when*, and each of the four conditions is
 * load-bearing:
 *
 *  - `listedFor === user.id`. The SDK lists this user's wallets from the server
 *    on mount, and until that lands `wallets` is `[]`, which is indistinguishable
 *    from a user who genuinely has none. Creating inside that window mints a
 *    second wallet for somebody who already had one. `fetching-wallets` is the
 *    status the SDK publishes while the list is in flight, so having *seen* it is
 *    what makes a later `[]` mean what it says.
 *  - `embeddedState === EMBEDDED_SIGNER_NOT_CONFIGURED`. The SDK's own words for
 *    "signed in, and this device holds no key share". It rules out the window
 *    where a returning session is still reconnecting its signer — which reads as
 *    wallet-less right up until it doesn't.
 *  - `status === 'disconnected'`. Nothing of ours is already in flight.
 *  - `asked.current !== user.id`. Once per user. Both this and `listedFor` are
 *    keyed on the user id rather than being booleans, because signing out and
 *    back in as somebody else is a different question: a flag that only flips
 *    once would leave the second account with no wallet and nothing left to ask
 *    with.
 */

import {
  EmbeddedState,
  useEmbeddedEthereumWallet,
  useOpenfortContext,
  useUser,
} from '@openfort/react-native';
import type { EIP1193Provider } from '@yodlpay/react-native';
import { useEffect, useRef, useState } from 'react';
import { type Hex, hexToNumber, isHex } from 'viem';

export interface WalletState {
  /** Signing and RPC transport. `null` until the embedded wallet connects. */
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
  const { user } = useUser();
  const { embeddedState } = useOpenfortContext();
  const ethereum = useEmbeddedEthereumWallet();
  const { status, wallets, create, setActive } = ethereum;

  const connected = ethereum.status === 'connected' ? ethereum : null;
  // One object under two views. The event surface below is declared on
  // Openfort's, and the Yodl-facing type declares only `request` — it uses the
  // provider purely as transport and has no business with the events.
  const embedded = connected?.provider ?? null;
  const provider = embedded as unknown as EIP1193Provider | null;
  const address = connected?.activeWallet.address ?? null;

  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!embedded) {
      setChainId(null);
      return;
    }

    // `cancelled` matters here: the read is async and the effect can be torn down
    // mid-flight (sign-out, wallet switch). Without the guard a resolved promise
    // from the previous provider writes its chain over the current one.
    let cancelled = false;

    const readChainId = async () => {
      try {
        const current = await embedded.request({ method: 'eth_chainId' });
        if (!cancelled) setChainId(toChainId(current));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    };

    const onChainChanged = (next: unknown) => setChainId(toChainId(next));
    // Openfort emits this with `[]` when the signer detaches and `[address]` when
    // it attaches, and the chain the provider answers with is resolved at the
    // same moment. Asking again is cheaper than working out which of the two just
    // happened.
    const onAccountsChanged = () => void readChainId();

    void readChainId();
    embedded.on('chainChanged', onChainChanged);
    embedded.on('accountsChanged', onAccountsChanged);

    return () => {
      cancelled = true;
      embedded.removeListener('chainChanged', onChainChanged);
      embedded.removeListener('accountsChanged', onAccountsChanged);
    };
  }, [embedded]);

  // A failed create or recovery lands on the union rather than on the promise we
  // awaited — the SDK keeps the message as a string — so it is read back out here
  // and joins the one `YodlHost` renders.
  const statusError = ethereum.status === 'error' ? ethereum.error : null;

  useEffect(() => {
    if (statusError) setError(new Error(statusError));
  }, [statusError]);

  /** The user whose wallet list we have watched the SDK finish. */
  const [listedFor, setListedFor] = useState<string | null>(null);
  /** The user we have already asked for, so the ask happens exactly once. */
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (user && status === 'fetching-wallets') setListedFor(user.id);
  }, [user, status]);

  useEffect(() => {
    if (!user || listedFor !== user.id || asked.current === user.id) return;
    if (status !== 'disconnected') return;
    if (embeddedState !== EmbeddedState.EMBEDDED_SIGNER_NOT_CONFIGURED) return;

    asked.current = user.id;
    const [existing] = wallets;

    void (async () => {
      try {
        // `setActive` reads as a cheap local switch and is nothing of the kind:
        // it is the key-share recovery round trip, which is exactly what a device
        // that has never held this wallet needs.
        if (existing) await setActive({ address: existing.address as Hex });
        else await create();
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    })();
  }, [user, listedFor, status, wallets, create, setActive, embeddedState]);

  return {
    provider,
    address,
    chainId,
    isConnected: provider !== null && address !== null && chainId !== null,
    error,
  };
}
