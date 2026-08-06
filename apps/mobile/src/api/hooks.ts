/**
 * Every read against the Nightmarket API, as a hook per endpoint.
 *
 * Each one is `useQuery` over an options object written where it is used: the key
 * and the query function sit together, so the two cannot drift apart, and there
 * is no factory or wrapper in between for a caller to unwrap. `useAppQuery` used
 * to be that wrapper; it existed only to bolt a screen-focus refetch onto every
 * read, and both are gone — see `query.tsx` for what keeps the screens current
 * instead.
 *
 * There used to be a hand-rolled `useResource` here — four pieces of state, a
 * three-mode loader, two `useFocusEffect`s and a rule about which failures may
 * blank a screen. All of it was a smaller, less careful version of what the
 * library does, and the two files that needed the same behaviour (this one and
 * `useBalance`) had to share an exported type to keep from drifting. Screens now
 * consume `UseQueryResult` directly: `data`, `error`, `isLoading` for the first
 * load, `isRefetching` for a pull, `refetch` to ask again.
 *
 * `useStats` still has no caller: the activity screen's reconciliation ledger
 * moved to per-payment attribution on the detail screen. It stays because it is
 * one hook over an endpoint that still exists, and deleting a working reader to
 * satisfy a lint rule is how the next screen that wants it gets a hand-rolled
 * fetch instead.
 */

import type { NightmarketPayment } from '@nightmarket/shared';
import { isTerminalState } from '@nightmarket/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { BALANCE_KEY } from '~/wallet/useBalance';
import { api } from './client';
import { queryClient, useIsScreenFocused } from './query';

/**
 * Reading our own store, waiting for a webhook to land on it — so this is cheap and
 * touches nothing upstream. It still gives up: a delivery that fails its retries is
 * never sent again, so an interval with no end would wait for something that is not
 * coming. Past the cap, pull-to-refresh is the way to ask again.
 */
const POLL_MS = 2_000;
const POLL_GIVE_UP_MS = 300_000;

/**
 * The wallet's own payments — `matched` and `pending`, never someone else's claim.
 *
 * Paginated, because the backend always was: `/v1/wallets/:address/payments`
 * returns 25 rows and a `nextCursor`, and reading only the first page meant a
 * wallet with more than 25 payments had a feed that stopped without saying so.
 * Nothing on screen distinguished "that is everything" from "that is the first
 * page", which is the worst version of the bug — the list looked complete.
 *
 * `useInfiniteQuery` takes the cursor from the previous page's answer. Returning
 * the API's `nextCursor` straight through works because the library treats
 * `null` and `undefined` alike as "no further pages" — so the backend saying
 * `null` is already the whole end-of-feed condition, and `hasNextPage` follows
 * from it with nothing to keep in step by hand.
 */
export function useFeed(address: string | null) {
  return useInfiniteQuery({
    queryKey: FEED_KEY(address),
    // Only ever called with an address: `enabled` is what guarantees it, and a
    // wallet that has not connected is not an error, just nothing to read yet.
    queryFn: ({ pageParam }) => api.walletPayments(address as string, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: address !== null,
  });
}

/**
 * The feed's key, as a function so the prefix and the full key are one
 * definition. `invalidateFeed` names the prefix; `useFeed` names the whole
 * thing, and neither can drift from the other.
 */
const FEED_KEY = (address?: string | null) =>
  address === undefined
    ? (['payments', 'wallet'] as const)
    : (['payments', 'wallet', address] as const);

/**
 * Say that the wallet's money and history are out of date.
 *
 * This is what replaced refetching every read whenever a screen came back into
 * view. There are exactly two moments this app knows the server changed — a
 * transaction was sent (`pay`), and a payment we were watching reached a state it
 * will never leave (`usePayment` below) — and both of them are here rather than
 * inferred from navigation. An invalidated query with a mounted observer
 * refetches immediately, so the feed sitting underneath a payment screen is
 * already correct by the time the user gets back to it.
 *
 * The balance goes with it: a payment that settled is money that left the wallet,
 * and a feed that updates beside a stale hero figure is the worse half-truth.
 */
export function invalidateWalletData() {
  void queryClient.invalidateQueries({ queryKey: FEED_KEY() });
  void queryClient.invalidateQueries({ queryKey: BALANCE_KEY() });
}

/**
 * One payment, for the detail screen.
 *
 * Fetched rather than handed down through route params: the row that pushed
 * this screen is a snapshot from whenever the feed last loaded, and the
 * interesting case — a `pending` payment that Yodl indexed while the user was
 * looking at it — is exactly the one a passed-through object gets wrong. The
 * route carries the identity; the screen reads the record.
 *
 * The app lands here the moment a payment has a hash, so this is watching an
 * unsettled record rather than reading a historical one. A poll that fails leaves
 * the payment on screen: `data` survives an errored refetch, which is what the
 * old loader needed a `'poll'` mode to get.
 */
export function usePayment(chainId: string | undefined, txHash: string | undefined) {
  // `refetchInterval` ticks for as long as the hook is mounted, and the stack
  // keeps a screen mounted under whatever was pushed over it — so the screen's
  // own focus is what decides whether there is a poll at all.
  const focused = useIsScreenFocused();

  const query = useQuery({
    queryKey: ['payments', chainId, txHash],
    queryFn: () => api.payment(chainId as string, txHash as string),
    enabled: Boolean(chainId && txHash),
    // Recomputed from the latest data on every tick, which is how the poll stops
    // once the state can no longer change — no second piece of state, and no
    // effect chasing the last response. Backgrounding the app stops it too
    // (`refetchIntervalInBackground` defaults to false), and the return to
    // foreground refetches through `focusManager` anyway.
    refetchInterval: focused ? (current) => pollIntervalFor(current.state.data) : false,
  });

  /**
   * A payment that settles *while this screen watches it* leaves the feed behind
   * it wrong: a row still reading "in flight", beside a balance that has moved.
   * That is the second of the two moments this app knows the server changed.
   *
   * It is a transition, not a state, and the difference is not pedantry —
   * opening a payment that settled last week changed nothing, and invalidating
   * there would refetch every loaded page of the feed to learn that. So the
   * unsettled reading has to come first. The dependency is the state itself
   * rather than `data`, whose identity changes on every poll.
   */
  const state = query.data?.state;
  const watching = useRef(false);

  useEffect(() => {
    // Nothing read yet — not the same as "not settled".
    if (state === undefined) return;

    if (!isTerminalState(state)) {
      watching.current = true;
      return;
    }
    if (!watching.current) return;
    watching.current = false;
    invalidateWalletData();
  }, [state]);

  return query;
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => api.stats() });
}

function pollIntervalFor(payment: NightmarketPayment | undefined): number | false {
  // Nothing known yet is a reason to keep asking, not to stop: the record may still
  // be a moment behind the navigation that brought us here.
  if (!payment) return POLL_MS;
  if (isTerminalState(payment.state)) return false;

  const startedAt = Date.parse(payment.intentAt ?? payment.notifiedAt ?? '');
  if (!Number.isFinite(startedAt)) return POLL_MS;
  return Date.now() - startedAt > POLL_GIVE_UP_MS ? false : POLL_MS;
}
