/**
 * Remembering that this wallet already has a Yodl account.
 *
 * The SDK deliberately tells us almost nothing. From the docs:
 *
 *   "The SDK exposes no account details from the hosted flow. `onSignedUp` tells
 *    you the user finished — nothing more. If you need to remember that, persist
 *    it in your own app state, storage or backend. There is no API to query it
 *    back from the SDK."
 *
 * So this is that storage. Without it, the app has no way to tell a wallet that
 * has signed up from one that hasn't, and the only honest thing it can do is
 * offer signup again — which is what makes a returning user stare at "Complete
 * Registration" a second time.
 *
 * Keyed by address, because a Yodl account is bound to a wallet, not to a person:
 * one signed-in user switching wallets genuinely does need to register again.
 *
 * `expo-secure-store` rather than a plain key-value store only because it is
 * already a dependency (Openfort requires it). Nothing here is secret — it is a
 * boolean about a public address — and it is a cache, not a source of truth: the
 * hosted flow re-checks on mount and reports `signed_up` regardless of what we
 * think, which is what repairs this if it is ever wrong.
 */

import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { useCallback } from 'react';

/** SecureStore keys allow [A-Za-z0-9._-], which a 0x address satisfies. */
const keyFor = (address: string) => `yodl-signed-up-${address.toLowerCase()}`;

/**
 * Keyed by address like every other read in the app, so a wallet switch asks a
 * new question rather than overwriting the answer to the old one — which is the
 * race the hand-rolled version needed a `cancelled` flag to survive.
 */
export function yodlAccountQuery(address: string | null) {
  return queryOptions({
    queryKey: ['yodl-signed-up', address] as const,
    queryFn: async () => {
      // A failed read is not a failed signup, and a rejected query would be —
      // catching it here keeps "don't know" out of the error channel and costs
      // the user a re-check rather than a wrong answer.
      const value = await SecureStore.getItemAsync(keyFor(address as string)).catch(() => null);
      return value === '1';
    },
    enabled: address !== null,
    // Device storage that only this hook writes, so there is nothing to go stale
    // against: read once per address per session.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

export interface YodlAccountState {
  /** `null` while reading storage — distinct from "we know they haven't". */
  signedUp: boolean | null;
  markSignedUp: () => void;
}

/**
 * The one read in the app with nothing to refresh against: it asks device
 * storage that only this hook writes, which is why it carries an infinite
 * `staleTime` while every other read here carries none. The hosted flow
 * re-checks signup status on mount, and that is what repairs this if it is ever
 * wrong.
 */
export function useYodlAccount(address: string | null): YodlAccountState {
  const client = useQueryClient();
  const { data } = useQuery(yodlAccountQuery(address));

  const markSignedUp = useCallback(() => {
    if (!address) return;
    // The cache is what this session reads, so it is updated first and directly.
    // `queryOptions` brands the key with the data type, so this `true` is checked
    // against what the query function returns rather than taken on trust.
    client.setQueryData(yodlAccountQuery(address).queryKey, true);
    // Fire and forget: a failed write costs the user one extra status check on
    // next launch.
    void SecureStore.setItemAsync(keyFor(address), '1').catch(() => {});
  }, [address, client]);

  return { signedUp: data ?? null, markSignedUp };
}
