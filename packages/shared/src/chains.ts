/**
 * Chains, from viem's registry rather than from a map written here.
 *
 * There used to be two hand-kept tables in this package — one of display names,
 * one of explorer hosts — and two more lists in the app: `SUPPORTED_CHAIN_IDS`
 * for the Yodl SDK and `SUPPORTED_CHAINS` for Privy, with a comment on each
 * begging the reader to keep them in sync. viem already ships all four facts per
 * chain (id, name, explorer, RPC), and the app already depends on viem for the
 * balance read, so the tables were a copy of a dependency we were shipping anyway.
 *
 * Everything is derived from `SUPPORTED_CHAINS` below. A chain added there is
 * added to Privy's allowlist, to `chainName` and to `explorerUrl` in one edit —
 * which is the whole reason for this file. The Yodl SDK is the one deliberate
 * exception: it pays on Base alone (`apps/mobile/src/yodl/sdk.ts`).
 */

import type { Chain } from 'viem/chains';
import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains';

/**
 * Chains the wallet is allowed to be on: Privy's allowlist.
 *
 * Base and Arbitrum are where Yodl's supported corridors settle today; mainnet is
 * here so a wallet that starts on it has somewhere to switch *from* rather than
 * erroring. Privy refuses a `wallet_switchEthereumChain` outside this list and
 * Yodl's hosted UI asks for exactly the chains it was told about, so whatever the
 * SDK is given must stay inside this list — a wider one used to surface as a
 * payment dying at the switch step with an error the user could not act on. The
 * SDK is given Base alone.
 */
export const SUPPORTED_CHAINS = [base, arbitrum, mainnet] as const;

/**
 * Chains we can *name*, which is a longer list than the chains we can be on.
 *
 * A webhook is a claim from the internet: it carries whatever chain the payment
 * was actually made on, which need not be one the app can switch to. Naming
 * Polygon correctly on a row we cannot originate costs one import.
 */
const KNOWN_CHAINS: readonly Chain[] = [...SUPPORTED_CHAINS, optimism, polygon];

/** viem's chain record, or `undefined` for an id we don't carry. */
export function chainFor(chainId: string | number): Chain | undefined {
  const id = Number(chainId);
  return Number.isFinite(id) ? KNOWN_CHAINS.find((chain) => chain.id === id) : undefined;
}

/**
 * Human label for a chain id. Unknown chains show their number rather than
 * "Unknown" — a number is a fact the user can look up.
 *
 * The names are viem's, which are the chains' own: "Arbitrum One", not the
 * "Arbitrum" this used to say, and "OP Mainnet" rather than "Optimism".
 */
export function chainName(chainId: string | number): string {
  return chainFor(chainId)?.name ?? `Chain ${chainId}`;
}

/**
 * Where to read a transaction outside this app.
 *
 * Deliberately **not** defaulted the way `chainName` is: guessing a host produces
 * a link that 404s or — worse — resolves to a different chain's explorer and
 * shows nothing. `null` is the caller's cue to hide the control rather than offer
 * a dead one. viem carries the explorer per chain, so this is now the same lookup
 * as the name rather than a second table that could disagree with it.
 */
export function explorerUrl(chainId: string | number, txHash: string): string | null {
  const explorer = chainFor(chainId)?.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${txHash}` : null;
}
