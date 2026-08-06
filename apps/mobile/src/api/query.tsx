/**
 * The one query client, and the one thing React Native has to tell it.
 *
 * TanStack Query owns every read in this app — HTTP and on-chain alike — so the
 * loading/error/refreshing machinery that used to live in `hooks.ts` is gone.
 * What is left here is the wiring the library cannot do for itself on a phone:
 * there is no `window` to hear a focus event on, so `QueryProvider` turns
 * `AppState` into the focus signal the library already knows what to do with.
 *
 * ── There is no screen-focus refetch any more ─────────────────────────────────
 *
 * There used to be a `useRefreshOnFocus`, wrapped around every read: a
 * `useFocusEffect` that refetched whenever a route became active again, with two
 * rules nobody could infer from reading the call site — skip the first focus
 * (it coincides with mount, where the query is already fetching), and honour
 * `enabled` by hand (because `refetch()` does not, so a disconnected wallet
 * asked for `/v1/wallets/undefined/payments` on every focus). Both rules were
 * bugs found after the fact, which is what a hand-rolled refetch policy costs.
 *
 * What keeps the screens current instead is four things the library or the
 * backend already does:
 *
 *   mount            `staleTime` is 0, so a screen that mounts fetches. Most
 *                    navigation in this app is a mount.
 *   app foreground   `focusManager`, below — the return from a hosted Yodl
 *                    browser, and the case the old hook was really aimed at.
 *   invalidation     the two moments this app knows the server changed: an
 *                    intent recorded (`pay`), and a watched payment reaching a
 *                    state it will never leave (`usePayment`). Both invalidate
 *                    the feed, which refetches it while it is still mounted
 *                    underneath — precisely when there is something new, rather
 *                    than on every navigation in case there might be.
 *   pull-to-refresh  the user's own answer, on the one screen that lists things.
 *
 * The reads themselves are not here. Each one is a hook next to the function it
 * calls — `api/hooks.ts`, `wallet/useBalance.ts`, `yodl/useYodlAccount.ts` — with
 * its key and its query function written together in the options object.
 */

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Everything is stale the moment it arrives.
       *
       * The library default, and the right one here rather than an oversight:
       * every number this app shows is money that can change while the user is
       * looking away, and the one thing a payment demo must never do is show a
       * balance from before the payment. The cache still earns its keep — the
       * cached value is what stays on screen *while* the refetch runs, which is
       * the "a focus refetch must not blank a screen that has content" rule the
       * old `Resource` type had to spell out in a comment.
       */
      staleTime: 0,
      /**
       * Read failures are shown, not retried.
       *
       * `request()` already spends a 10s timeout before it gives up, so a retry
       * pass would push the "your API URL points at the phone" message — the
       * common failure in development — twenty seconds past the moment it became
       * useful. A 404 is not transient at all: the payment detail screen reads
       * that status to decide between "never heard of it" and "backend
       * unreachable". What replaces retrying is asking again on purpose:
       * pull-to-refresh, the poll on the detail screen, a focus refetch.
       */
      retry: false,
      // The library cannot observe window focus on a phone; `focusManager` below
      // is what feeds it, and this is the flag that makes the signal do anything.
      refetchOnWindowFocus: true,
    },
  },
});

/**
 * The provider, and the app-focus signal — which has one consumer, so it lives
 * here rather than in a hook of its own.
 *
 * Web is excluded because there the browser's own focus events already reach the
 * library, and setting it from `AppState` as well would fight them.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * Whether this screen is the one on top, as state rather than as an effect.
 *
 * Only polling needs it. `refetchInterval` keeps ticking for as long as the hook
 * is mounted, and a screen left in the stack stays mounted — so without this, a
 * detail screen the user pushed away from would go on asking the backend about a
 * payment nobody is looking at.
 */
export function useIsScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return focused;
}
