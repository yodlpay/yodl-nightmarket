/**
 * The wallet: what you can spend, how to add to it, and what you have paid.
 *
 * One screen rather than three, reached from the wallet chip on the scanner. The
 * app has exactly one job and this is the drawer beside it — splitting the
 * balance, the account and the history into separate tabs would give three of
 * them equal billing with paying.
 *
 * The feed is read from our own backend rather than from Yodl's Payments API
 * directly, because the API secret would have to ship in the bundle to do the
 * latter, and anything holding it can read every payment made through the
 * integration. The backend holds it; the app asks the backend. The balance is
 * the one number on this screen that does *not* come from there — see
 * `useBalance`.
 *
 * ── What changed, and why it was wrong before ─────────────────────────────────
 *
 * The 56pt numeral used to be `stats.settled`: the integration-wide settlement
 * total across every wallet Nightmarket has ever reconciled, captioned "Settled
 * through Nightmarket" so the caption could do damage control for the fact that
 * it was not the user's money. No wallet app puts anything but *your* money at
 * that size, and the caption was the tell. It is the spendable balance now, and
 * the caption is one word.
 *
 * Directly beneath the number used to sit the Reconciled / In flight / Unclaimed
 * ledger and a paragraph explaining webhook attribution. That is the most
 * interesting thing about the backend and the least interesting thing to someone
 * working out whether they can afford a bowl of noodles, and it occupied the
 * exact slot every wallet uses for actions. It now lives on one payment's detail
 * screen, attached to a specific claim instead of to a counter.
 *
 * So the order is: balance, list. Two things, and the number sits directly on
 * the payments it explains.
 *
 * There was briefly a row of tiles between them — Top up, Account, Dashboard —
 * which is what every wallet in the research puts there. It is gone: two of the
 * three led to hosted Yodl surfaces nobody using this screen was going to open,
 * and a row of three tiles where one is worth tapping is a row that teaches you
 * to skip it. Top up moved into the wallet card, under the number it changes;
 * `/onboard` and `/dashboard` remain registered routes and are reachable by
 * link, they just no longer have a door on this screen.
 *
 * The wallet card is the app's single inverted surface — Ink on Paper in light,
 * Paper on Ink in dark — and it carries the one 56pt numeral the design allows
 * per screen. There is no colour on this screen at all: the accent survives only
 * on a focused field, which this screen does not have.
 *
 * "Scan" is the primary action and sits in the thumb arc at the foot as the
 * screen's only `radius.full` pill, floating on a `bg`-coloured mask so scrolled
 * rows pass behind it rather than through it. Top up is `quiet` inside the card
 * and not a second pill for that reason — two pills is two primary actions.
 *
 * Signing out sits beside the title. As the list's footer it landed wherever the
 * content happened to end, which on an empty feed was the middle of nowhere.
 */

import type { NightmarketPayment } from '@nightmarket/shared';
import { chainName, truncateAddress } from '@nightmarket/shared';
import { space } from '@nightmarket/theme';
import { useSignOut } from '@openfort/react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeed } from '~/api/hooks';
import { queryClient } from '~/api/query';
import { Button } from '~/ui/Button';
import { Card } from '~/ui/Card';
import { PaymentRow } from '~/ui/PaymentRow';
import { Screen } from '~/ui/Screen';
import { Txt } from '~/ui/Txt';
import { useColors, useInvertedColors } from '~/ui/theme';
import { useBalance } from '~/wallet/useBalance';
import { useWallet } from '~/wallet/useWallet';

/** The pill plus the breathing room above it, so the list can clear itself. */
const CTA_HEIGHT = 52 + space.lg;

export default function Activity() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useSignOut();
  const wallet = useWallet();
  const feed = useFeed(wallet.address);
  const balance = useBalance(wallet.provider, wallet.address, wallet.chainId);

  // One list out of every page fetched so far. `pages` is append-only, so a row
  // never moves because a later page arrived — and the day grouping runs over
  // the whole feed rather than per page, which is what keeps a day that straddles
  // a page boundary from getting its header printed twice.
  const pages = feed.data?.pages;
  const rows = useMemo(() => groupByDay(pages?.flatMap((page) => page.payments) ?? []), [pages]);

  return (
    <Screen>
      {/* Sign out belongs here, beside the title. As the list's footer it landed
          wherever the content happened to end — floating in the middle of an
          empty screen, styled like a link, a long way from anything it relates
          to. It is an account action, and the account is what this screen is. */}
      <View style={styles.header}>
        <Txt variant="title" style={{ flex: 1 }}>
          Activity
        </Txt>
        {/* The cache goes with the session. Keys are address-scoped, so the next
            wallet would not be *shown* the last one's payments — but a signed-out
            app holding a signed-in user's ledger in memory is not a thing to
            leave to key hygiene. */}
        <Button
          label="Sign out"
          variant="text"
          onPress={() => {
            void signOut();
            queryClient.clear();
          }}
        />
      </View>

      <FlatList<FeedRow>
        data={rows}
        keyExtractor={(row) =>
          row.kind === 'day' ? `day:${row.key}` : `${row.payment.chainId}:${row.payment.txHash}`
        }
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            // Sentence case, in Slate. The uppercase wide-tracked eyebrow that
            // used to sit here is one of the loudest period tells in the old
            // design, and it was on nine screens.
            <Txt variant="caption" tone="secondary" style={styles.dayHeader}>
              {item.title}
            </Txt>
          ) : (
            // No divider, and no wrapper to hang one on. The day header, the
            // 68pt row rhythm and the avatar column do the separating — a
            // hairline rule under every row is a list pretending to be a table.
            //
            // The row goes somewhere now. It always accepted an `onPress` and
            // nothing passed one, so the chevron and the pressed fill it already
            // draws were dead code and the feed was a wall of inert text.
            <PaymentRow
              payment={item.payment}
              onPress={() =>
                router.push({
                  pathname: '/(market)/payment/[chainId]/[txHash]',
                  params: { chainId: item.payment.chainId, txHash: item.payment.txHash },
                })
              }
            />
          )
        }
        contentContainerStyle={[styles.list, { paddingBottom: CTA_HEIGHT + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            // `isFetchingNextPage` is excluded deliberately: it is `isFetching`
            // too, so without this the pull-to-refresh spinner appears at the top
            // of the screen every time the user scrolls to the bottom.
            refreshing={(feed.isRefetching && !feed.isFetchingNextPage) || balance.isRefetching}
            tintColor={colors.textMuted}
            onRefresh={() => {
              void feed.refetch();
              void balance.refetch();
            }}
          />
        }
        // Half a screen of warning, so the next page is usually already there by
        // the time the user reaches the end of this one.
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          // `hasNextPage` is false while the first page is still loading, so this
          // cannot fire ahead of it; the `isFetchingNextPage` guard is for
          // `onEndReached` firing repeatedly during a single fling.
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        // Only ever a spinner for a page already on its way. There is no "load
        // more" button: the cursor is opaque and the pages are 25 rows, so a
        // control asking the user to request each one is a control that exists
        // because the list could not be bothered to ask for itself.
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.textMuted} />
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.top}>
            <WalletCard address={wallet.address} chainId={wallet.chainId} balance={balance} />
          </View>
        }
        // No card. A grey slab the shape of a payment row reads as a disabled
        // payment, which is the one thing it is not. Plain text, centred in the
        // space the list would have filled.
        ListEmptyComponent={
          <View style={styles.empty}>
            <Txt
              variant="body"
              tone={feed.error ? 'error' : 'muted'}
              style={{ textAlign: 'center' }}
            >
              {feed.isLoading
                ? 'Reading the ledger…'
                : feed.error
                  ? feed.error.message
                  : 'No payments yet. Scan a merchant code and it appears here.'}
            </Txt>
          </View>
        }
      />

      {/*
        The floating action. `bg`-filled rather than transparent so a row
        scrolling past reads as going *behind* the pill instead of through it,
        and `bg` rather than `surface` because a bar the colour of the ground is
        the foot of the screen rather than a second object on it.

        It pads its own safe area. `Screen` already insets its content, but this
        bar is absolutely positioned, and an absolute child is laid out against
        the padding edge — so `bottom: 0` put the pill under the gesture bar with
        the home indicator drawn across it.
      */}
      <View
        style={[
          styles.cta,
          { backgroundColor: colors.bg, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <Button
          label="Scan"
          accessibilityLabel="Scan a merchant code"
          onPress={() => router.replace('/(market)')}
        />
      </View>
    </Screen>
  );
}

/**
 * Day headers, flattened into the same list rather than a `SectionList`.
 *
 * The feed is one page of rows and a section list would buy sticky headers we
 * don't want — a header that follows you down the screen is a second thing to
 * read while scrolling. Flattening keeps `FlatList`, keeps pull-to-refresh, and
 * keeps the payment key exactly what it was.
 */
type FeedRow =
  | { kind: 'day'; key: string; title: string }
  | { kind: 'payment'; payment: NightmarketPayment };

function groupByDay(payments: readonly NightmarketPayment[], now = new Date()): FeedRow[] {
  const days = new Map<string, { title: string; payments: NightmarketPayment[] }>();

  for (const payment of payments) {
    const at = parseDate(payment.notifiedAt ?? payment.intentAt);
    const key = at ? at.toDateString() : 'undated';
    const day = days.get(key);
    if (day) day.payments.push(payment);
    else days.set(key, { title: at ? dayTitle(at, now) : 'Undated', payments: [payment] });
  }

  const rows: FeedRow[] = [];
  for (const [key, day] of days) {
    rows.push({ kind: 'day', key, title: day.title });
    for (const payment of day.payments) rows.push({ kind: 'payment', payment });
  }
  return rows;
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/** "Today" / "Yesterday" / "Mon 3 Nov" this year / "3 Nov 2025" beyond it. */
function dayTitle(date: Date, now: Date): string {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((midnight(now) - midnight(date)) / 86_400_000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';

  const sameYear = date.getFullYear() === now.getFullYear();
  try {
    // Same fallback reasoning as the shared formatters: an unusual locale build
    // can still throw, and a thrown formatter here is a blank feed.
    return new Intl.DateTimeFormat(
      'en-GB',
      sameYear
        ? { weekday: 'short', day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' },
    ).format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * The one inverted surface in the app, and the only one carrying a hero numeral.
 *
 * Inverting it per mode — Ink on Paper in light, Paper on Ink in dark — is what
 * keeps the two builds recognisably the same design rather than two themes, and
 * it is the only place the app's single neutral shadow reads (light mode only;
 * `Card` drops it in dark, where a shadow on a near-black ground is a smudge).
 * Everything drawn on it takes its colours from `useInvertedColors()`, because a
 * role picked from the screen's own palette lands at 2.5:1 on a card running the
 * other way.
 *
 * The card states two facts and keeps them apart: the money, then the identity
 * holding it. The hero is this wallet's own spendable balance — "Spendable" is
 * the caption because it is one word, it is the user's word, and it is the
 * honest one: this is a spot balance, not a portfolio valuation. The card used
 * to lead with an integration-wide settlement total, which is why its caption
 * had to be a sentence.
 *
 * Three states, and the point of the design is that they are visibly different
 * from each other:
 *
 *   loading / no wallet   "—", and the identity line says "Connecting…". No
 *                         spinner — a spinner on a number that arrives in
 *                         200ms is a flash, and the em dash already reads as
 *                         "not known yet" everywhere else in this app.
 *   read failed           "—" plus "Balance unavailable" under it. Muted, not
 *                         `tone="error"`: a failed RPC read is not a failed
 *                         payment, and `tone` picks from the screen's palette
 *                         which is the wrong one on this card anyway.
 *   read                  "$24.10" plus "USDC · Base". "$0.00" is this state,
 *                         not a fourth one — an empty wallet is a read that
 *                         succeeded.
 *
 * The sub-line is occupied in all three and Top up sits under it in all three,
 * so the card is one fixed height. It used to show Top up only at zero, which
 * meant the card grew by 44pt at the exact moment the balance resolved.
 *
 * **Top up lives here because it is the only way to reach that screen.** The
 * tile row this card used to sit above — Top up, Account, Dashboard — is gone,
 * so the button in the card is not a contextual duplicate of anything any more.
 * Under the number it changes is where every wallet in the research puts it, and
 * `quiet` rather than a pill because the pill at the foot is Scan.
 */
function WalletCard({
  address,
  chainId,
  balance,
}: {
  address: string | null;
  chainId: number | null;
  /** Whatever the hook returns — the card reads `data` and `error`, nothing else. */
  balance: ReturnType<typeof useBalance>;
}) {
  const flipped = useInvertedColors();

  const chain = chainId ? chainName(chainId) : null;
  const wallet = address ? truncateAddress(address, 8, 6) : 'Connecting…';
  // An em dash for a value we don't have, so an unread balance and an unsettled
  // feed row say "not known" in exactly one voice.
  const hero = balance.data?.amount ?? '—';
  const token = chain ? `USDC · ${chain}` : 'USDC';

  return (
    <Card tone="inverted" lifted>
      {/* One element to assistive tech: a truncated address read character by
          character between two numbers is worse than a sentence. */}
      <View
        style={styles.walletCard}
        accessible
        accessibilityLabel={[
          balance.error
            ? 'Spendable, balance unavailable'
            : balance.data
              ? `Spendable, ${balance.data.amount} ${balance.data.token} on ${chainName(balance.data.chainId)}`
              : 'Spendable, not known yet',
          address ? `Your wallet ${wallet}` : 'wallet connecting',
        ].join('. ')}
      >
        <View style={styles.walletMoney}>
          <Txt variant="caption" style={{ color: flipped.textMuted }}>
            Spendable
          </Txt>
          {/*
            The number, alone. Two Ultramarine bars used to sit to its left as
            the app's signature — an equals sign meaning "four currencies in,
            one settlement out". At 56pt beside a numeral it read as a rendering
            artefact rather than as an operator, so it is gone. The caption above
            already says what the number is, which is the job the mark was
            failing to do.

            `flipped` because this is the app's one surface running against its
            scheme: text picked from the screen's own palette lands at 2.5:1 on
            an inverted card.
          */}
          <Txt
            variant="amountHero"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: flipped.text }}
          >
            {hero}
          </Txt>

          {balance.error ? (
            <Txt variant="small" numberOfLines={1} style={{ color: flipped.textMuted }}>
              Balance unavailable
            </Txt>
          ) : (
            <Txt variant="small" numberOfLines={1} style={{ color: flipped.textSecondary }}>
              {token}
            </Txt>
          )}

          {/* `quiet` reads correctly here without being handed inverted colours,
              and that is not luck: its fill is the screen palette's inset step
              and its label the screen palette's ink, so on a card running the
              *other* way the pair arrives as a legible chip — the same
              inversion the card itself performs. `alignSelf` because a
              full-width button inside the card would compete with the pill. */}
          <Button
            label="Top up"
            variant="quiet"
            accessibilityLabel="Top up your wallet"
            style={styles.walletTopUp}
            onPress={() => router.push('/(market)/top-up')}
          />
        </View>

        <View style={styles.walletIdentity}>
          <Txt variant="caption" style={{ color: flipped.textMuted }}>
            {chain ? `Your wallet · ${chain}` : 'Your wallet'}
          </Txt>
          {/* One of DM Mono's two surviving jobs. An address is machine output
              and is the one string here where the digits have to line up. */}
          <Txt variant="mono" numberOfLines={1} style={{ color: flipped.textSecondary }}>
            {wallet}
          </Txt>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: space.lg },
  /** Bottom padding is applied inline — it depends on the safe area. */
  list: {},
  top: { gap: space.md, paddingBottom: space.sm },
  walletCard: { gap: space.xl },
  walletMoney: { gap: space.xs },
  /** Sized by its label. A stretched button inside the card competes with the pill. */
  walletTopUp: { alignSelf: 'flex-start', marginTop: space.xs },
  walletIdentity: { gap: 2 },
  dayHeader: { paddingTop: space.xl, paddingBottom: space.xs },
  /** Sized so the list does not jump when the next page's spinner appears. */
  footer: { height: 56, alignItems: 'center', justifyContent: 'center' },
  // Real height, so the empty state sits in the space the list would have
  // occupied rather than collapsing to one line under the ledger and leaving
  // a screen of nothing beneath it.
  empty: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  // Absolutely positioned, so it inherits none of `Screen`'s gutter — it has to
  // repeat `space.xl` itself or the pill runs edge to edge while every other
  // object on the screen is inset.
  cta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.lg,
    paddingHorizontal: space.xl,
  },
});
