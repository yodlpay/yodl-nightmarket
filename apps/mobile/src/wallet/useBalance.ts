/**
 * What the wallet can actually spend, read straight off the chain.
 *
 * There is no balance anywhere in the Nightmarket backend. `/v1/stats` returns
 * integration-wide aggregates and `/v1/wallets/:address/payments` returns
 * history; neither is this wallet's money. The alternative to this file was a
 * `/v1/wallets/:address/balance` endpoint, and it was rejected for a specific
 * reason rather than for effort: it puts an RPC dependency and a node key into a
 * backend that currently has neither, in order to serve a number the device is
 * already holding a provider for. Privy's EIP-1193 provider *is* an RPC
 * transport, and `viem` is already in the bundle.
 *
 * The read is one `balanceOf` against USDC on Base, and only on Base. USDC is
 * the token because it is what Yodl settles into, so "spendable" and "USDC
 * balance" are the same claim here — and calling it anything broader would be a
 * portfolio valuation, which this app has no business computing.
 *
 * **Base only, deliberately.** The wallet can still be switched to Ethereum or
 * Arbitrum mid-payment, because `SUPPORTED_CHAIN_IDS` allows it and Yodl needs
 * it. This number does not follow it there. Counting three chains' USDC into one
 * hero figure would state a total the user cannot spend in one go, and counting
 * whichever chain happened to be current would make the same wallet report three
 * different balances depending on where its last payment settled. One chain, one
 * number, and a wallet parked elsewhere reads "Balance unavailable" — which is
 * true, rather than a confident figure for the wrong ledger.
 *
 * **Nothing in this file parses an amount into a `number`.** `balanceOf` returns
 * a `bigint`, `formatUnits` turns it into a decimal string, and `formatAmount`
 * takes a string. The float round trip the shared formatters ban would be a
 * silent corruption here for exactly the same reason it is on an invoice.
 *
 * Zero is decided from the `bigint`, never from the formatted string. A wallet
 * holding 0.00004 USDC formats to "$0.00" and is not empty, and offering someone
 * a contextual "Top up" because a rounding rule made their balance look like
 * nothing is the kind of thing that gets noticed once and never trusted again.
 *
 * **A zero balance and an unreadable one must never render the same.** A chain
 * with no USDC address in the map below throws rather than returning zero, so
 * the card shows "—" and "Balance unavailable" instead of a confident "$0.00"
 * for money that might well be there.
 */

import { chainFor, chainName, formatAmount } from '@nightmarket/shared';
import { useQuery } from '@tanstack/react-query';
import type { EIP1193Provider } from '@yodlpay/react-native';
import { createPublicClient, custom, erc20Abi, formatUnits, getAddress } from 'viem';
import { base } from 'viem/chains';

/**
 * This read's key, as a function so the prefix and the full key are one
 * definition — `invalidateWalletData` in `api/hooks.ts` names the prefix when a
 * payment settles, and this file names the whole thing.
 */
export const BALANCE_KEY = (chainId?: number | null, address?: string | null) =>
  chainId === undefined ? (['balance'] as const) : (['balance', chainId, address] as const);

/**
 * The one chain "Spendable" is counted on.
 *
 * Exported because the top-up screen names it in copy, and a screen that invites
 * money onto a chain this file does not count is the specific bug worth spending
 * an export to prevent.
 */
export const BALANCE_CHAIN_ID = base.id;

/**
 * Canonical USDC on Base — Circle's native issuance, not a bridged variant.
 *
 * A map with one entry rather than a bare constant, because the lookup below is
 * what turns "the wallet is on some other chain" into a thrown error instead of
 * a silent read against the wrong address. Adding a chain here is the whole
 * change required to count it; see the header for why there is only one.
 */
const USDC: Record<number, `0x${string}`> = {
  [BALANCE_CHAIN_ID]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

/** USDC is six decimals. Not read from the contract: that would be a second call. */
const USDC_DECIMALS = 6;

export interface Balance {
  /** Already formatted for display — "$24.10". Never a number, at any point. */
  amount: string;
  /** Read from the `bigint`, so a rounded-to-nothing balance is not "empty". */
  isZero: boolean;
  /** What was counted, for the card's sub-line. */
  token: string;
  /** Which chain it was counted on. */
  chainId: number;
}

/**
 * A query like any other, refetched on focus like every other read in the app.
 *
 * It reads from a wallet provider rather than from our API, and that is the only
 * difference: the screen consuming it asks the same four questions — first load,
 * pull, failure, value — and answering them with a second hand-rolled loading
 * machine beside the library was exactly how the two drifted apart before.
 *
 * Never polled. A balance cannot change while the user is staring at it — it
 * changes when they pay — so this is re-read on the events that mean money moved:
 * a mount, the app coming back to the foreground, a pull, and the settlement
 * invalidation in `api/hooks.ts`. A timer would spend battery to learn nothing.
 *
 * The key is the address and the chain, not the provider. A provider object that
 * is recreated on render would otherwise evict a perfectly good balance for the
 * same wallet on every render; the chain id *is* in the key, because a wallet
 * switched to Arbitrum has a different answer — "unavailable" — and it must not
 * be served Base's number from cache.
 */
export function useBalance(
  provider: EIP1193Provider | null,
  address: string | null,
  chainId: number | null,
) {
  return useQuery({
    queryKey: BALANCE_KEY(chainId, address),
    queryFn: async (): Promise<Balance> => {
      // `enabled` below is what actually guarantees these three; this line is
      // what tells the compiler, and it costs less than three assertions.
      if (!provider || !address || chainId === null) throw new Error('Wallet not connected');

      const token = USDC[chainId];
      // The chain record is viem's, via the shared registry, rather than a
      // second one-entry map kept beside `USDC`. `USDC` is what decides whether
      // we count this chain; `chainFor` only says what the chain *is*.
      const chain = chainFor(chainId);
      // Not "no contract found" — USDC exists on the other chains and we are
      // choosing not to count it. Say which, so the log reads as a decision.
      if (!token || !chain) {
        throw new Error(`Spendable is counted on Base. This wallet is on ${chainName(chainId)}.`);
      }

      // `custom(provider)` rather than an HTTP transport: the wallet's own provider
      // is already pointed at the chain the wallet is on, so there is no node URL
      // to configure and no way for the two to drift apart mid-payment.
      const client = createPublicClient({ chain, transport: custom(provider) });

      const value = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        // `getAddress` rather than a cast to `0x${string}`. The cast asserted a
        // shape nobody had checked; this validates it, and a wallet address that
        // is not one fails here with a viem error naming the value instead of at
        // the RPC with a decoding error naming nothing.
        args: [getAddress(address)],
      });

      return {
        amount: formatAmount(formatUnits(value, USDC_DECIMALS), 'USD'),
        isZero: value === 0n,
        token: 'USDC',
        chainId,
      };
    },
    enabled: provider !== null && address !== null && chainId !== null,
  });
}
