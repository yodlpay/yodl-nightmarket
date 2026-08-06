/**
 * One payment, in full. What the feed row leaves out.
 *
 * A Nightmarket payment is a merchant payment rather than a token transfer, so
 * this screen is shaped like a receipt and not like a block explorer entry: who
 * you paid, what it cost in their currency, whether it landed, then the
 * reference rows. The identity leads because "Bún Chả Hương Liên" is what the
 * user remembers and `0x8f3a…` is not.
 *
 * Pushed rather than presented as a sheet, matching how `activity` itself
 * enters. A record you may want to sit with — read out, screenshot, check
 * against a paper bill — is not a glance-and-dismiss surface.
 *
 * ── The reconciliation ledger lives here now ──────────────────────────────────
 *
 * Reconciled / In flight / Unclaimed used to sit on the activity screen as three
 * counters with a paragraph under them explaining that a webhook is a claim
 * rather than a receipt. The explanation was true and the placement was wrong:
 * it occupied the slot every wallet uses for actions, and it described a
 * property of *individual payments* while being attached to a running total.
 * §7 of this screen is that same information, said once, about the one payment
 * you are looking at. The integration-wide roll-up stays available through the
 * Dashboard tile.
 *
 * ── On not tinting the status ─────────────────────────────────────────────────
 *
 * The state is a word, in Slate, at body size. No pill and no tint. `PaymentRow`
 * argued this at length — a red/green pair is the single most common thing
 * colour-blind users lose, and these states are not a good/bad axis anyway,
 * since `refund_success` is a *good* refund. Reintroducing a tinted chip one
 * route away from the row that rejected it would make the two screens disagree
 * about what a payment's state is worth looking at. `error` is the only hue
 * drawn, and only for the two states that are genuinely failures.
 *
 * The hero is `amount` at 34pt, not `amountHero` at 56. One hero numeral per
 * screen is the rule and this screen's is this one — the wallet card's 56pt
 * belongs to the balance, on the screen that owns the balance.
 */

import type { Attribution, NightmarketPayment } from '@nightmarket/shared';
import { chainName, explorerUrl, formatAmount, truncateHash } from '@nightmarket/shared';
import { radius, space } from '@nightmarket/theme';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ApiError } from '~/api/client';
import { usePayment } from '~/api/hooks';
import { Button } from '~/ui/Button';
import { Card } from '~/ui/Card';
import { Gate } from '~/ui/Gate';
import { IconFinder } from '~/ui/Icon';
import { FAILED, LABELS, payee, type RowState, SETTLED } from '~/ui/PaymentRow';
import { Screen } from '~/ui/Screen';
import { Txt } from '~/ui/Txt';
import { useColors } from '~/ui/theme';

/** Long enough to read, short enough that the control is back before you look again. */
const COPIED_MS = 1_600;

/**
 * What the attribution field means, said in a sentence rather than as a counter.
 *
 * `unmatched` is not reachable from the feed — `/v1/wallets/:address/payments`
 * returns only this wallet's `matched` and `pending` rows — but this route takes
 * its identity from the URL and is therefore reachable by deep link. A branch
 * that renders the honest sentence costs one line; the alternative is a screen
 * that silently claims our app sent something it did not.
 */
const ATTRIBUTION: Record<Attribution, string> = {
  matched: 'This app sent this payment and Yodl confirmed it.',
  pending: "This app sent this payment. Yodl hasn't indexed it yet.",
  unmatched:
    'This arrived claiming our integration address, but no transaction this app sent matches it.',
};

export default function PaymentDetail() {
  const { chainId, txHash } = useLocalSearchParams<{ chainId?: string; txHash?: string }>();
  const payment = usePayment(chainId, txHash);

  // A 404 is the backend saying it has never heard of this pair, which is a
  // different thing from the backend being unreachable and deserves a different
  // screen. The status code is the only thing that separates them.
  //
  // Only when there is nothing to show, though. `pay` seeds the record and
  // navigates without waiting for the POST that creates it, so the first GET can
  // legitimately arrive before the intent does — and `retry: false` means that
  // one 404 is the whole answer. Reading it as "we don't have this one" for a
  // payment the user just signed is the worst thing this screen can say. With
  // data present the miss is a race; without it, it is the deep link this branch
  // was written for.
  if (!payment.data && payment.error instanceof ApiError && payment.error.status === 404)
    return <NotFound />;

  return (
    <Screen>
      <View style={styles.header}>
        <Back />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {payment.data ? (
          <>
            {/* Said plainly, because a seeded record renders the same whether the
                backend answered or never picked up — and "awaiting confirmation"
                on a dead API is a screen quietly waiting for nobody. Muted and
                above the receipt: it qualifies everything under it. */}
            {payment.error ? (
              <Txt variant="small" tone="muted">
                Not reaching the backend right now, so this may be behind.
              </Txt>
            ) : null}
            <Detail payment={payment.data} />
          </>
        ) : payment.error ? (
          <Card>
            <Txt variant="small" tone="error">
              {payment.error.message}
            </Txt>
          </Card>
        ) : (
          <Skeleton />
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * The way back, as a text button in the screen's own top row.
 *
 * `headerShown: false` is the group default and every screen in the app draws
 * its own top, so introducing a native header bar here would give this one
 * screen a chrome nothing else has. `variant="text"` is what `activity` uses for
 * the control beside its title.
 */
function Back() {
  return <Button label="Back" variant="text" style={styles.back} onPress={() => router.back()} />;
}

function NotFound() {
  const colors = useColors();

  return (
    <Gate
      // The same glyph the two payment gates in `pay.tsx` use. A dead end about
      // a payment should look like the app's other dead ends about payments.
      icon={<IconFinder size={26} color={colors.textSecondary} />}
      eyebrow="Payment"
      title="We don't have this one"
      body="It may not have reached the backend yet. Pull to refresh the feed and try again."
      action={<Button label="Back to activity" onPress={() => router.back()} />}
    />
  );
}

/**
 * Three blocks at the heights of the things they stand in for.
 *
 * No spinner, matching the rest of the app: a placeholder the shape of the
 * content tells you what is coming, and a spinner tells you only that something
 * is happening.
 *
 * Unreachable from `pay`, which seeds the record before it navigates — and still
 * the honest first frame for the two arrivals that have nothing cached: a deep
 * link, and a tap on a feed row, whose data is filed under the feed's key rather
 * than this one.
 */
function Skeleton() {
  const colors = useColors();
  const block = { backgroundColor: colors.skeleton };

  return (
    <View style={styles.skeleton} accessible accessibilityLabel="Loading this payment">
      <View style={[styles.skeletonBlock, block, { height: 26 }]} />
      <View style={[styles.skeletonBlock, block, { height: 38, width: '55%' }]} />
      <View style={[styles.skeletonBlock, block, { height: 200 }]} />
    </View>
  );
}

function Detail({ payment }: { payment: NightmarketPayment }) {
  const colors = useColors();

  const state: RowState = payment.state ?? 'awaiting';
  const { title, initial } = payee(payment, state);

  const invoice = payment.invoice;
  // An invoice is genuinely absent for an `awaiting` row — we know the hash
  // before Yodl indexes the payment. A dash, never a zero: a receipt that says
  // "$0.00" for money that moved is worse than one that admits it doesn't know.
  const amount = invoice ? formatAmount(invoice.amount, invoice.currency) : null;
  const settlement = invoice
    ? formatAmount(invoice.settlementAmount, invoice.settlementCurrency)
    : null;
  const settled = SETTLED.has(state) && settlement !== null;

  const explorer = explorerUrl(payment.chainId, payment.txHash);

  return (
    <>
      <View style={styles.identity}>
        {/* The same 40pt rounded square the feed row draws, so the screen you
            arrive on is visibly the row you tapped. Never a circle. */}
        <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
          <Txt variant="bodyStrong" tone="secondary">
            {initial}
          </Txt>
        </View>
        {/* Wraps rather than truncates. A stall's name is the one string on this
            screen the user recognises, and half of it is not a name. */}
        <Txt variant="heading" numberOfLines={2} style={styles.identityTitle}>
          {title}
        </Txt>
      </View>

      <View style={styles.money}>
        <Txt variant="body" tone={FAILED.has(state) ? 'error' : 'secondary'}>
          {LABELS[state]}
        </Txt>
        <Txt variant="amount" numberOfLines={1} adjustsFontSizeToFit>
          {amount ?? '—'}
        </Txt>
        {/* Mono, because the settlement figure is the machine's answer to the
            invoice rather than the price anyone was quoted. */}
        <Txt variant="mono" tone={settled ? 'secondary' : 'muted'}>
          {settled && settlement ? `settles to ${settlement}` : 'not settled yet'}
        </Txt>
        {/* Absolute, not relative. The feed row already said "4m ago"; this
            screen exists to give the precise value. */}
        <Txt variant="small" tone="muted">
          {absolute(payment.notifiedAt ?? payment.intentAt)}
        </Txt>
      </View>

      <Card style={styles.rows}>
        <Row label="Network" value={chainName(payment.chainId)} />
        <Row label="Invoice" value={amount ?? '—'} />
        <Row label="Settled" value={settlement ?? '—'} />
        <Row label="Sent" value={absolute(payment.intentAt)} />
        <Row label="Confirmed" value={absolute(payment.notifiedAt)} />
        <HashRow hash={payment.txHash} />
      </Card>

      <Txt variant="small" tone="muted">
        {ATTRIBUTION[payment.attribution]}
      </Txt>

      {/* Hidden rather than guessed at for a chain we have no explorer for. A
          button that opens the wrong chain's explorer and shows nothing is
          worse than no button. */}
      {explorer ? (
        <Button
          label="View on block explorer"
          variant="quiet"
          onPress={() => void WebBrowser.openBrowserAsync(explorer).catch(() => {})}
        />
      ) : null}
    </>
  );
}

/** Label left, value right. No rule between them — the gap does the separating. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt variant="small" tone="secondary">
        {label}
      </Txt>
      <Txt variant="small" style={styles.value}>
        {value}
      </Txt>
    </View>
  );
}

/**
 * The transaction row, which is the one row worth taking away with you.
 *
 * Shown truncated and copied in full: a hash has no memorable prefix beyond
 * `0x`, so displaying all 66 characters costs three lines and buys nothing,
 * while copying anything less than all of them is a copy that has silently
 * failed. Same "Copied" affordance as the top-up screen's address field, because
 * they are the same gesture on the same kind of string.
 */
function HashRow({ hash }: { hash: string }) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const copy = () => {
    void Clipboard.setStringAsync(hash);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Copy the transaction hash"
      onPress={copy}
      style={({ pressed }) => [
        styles.row,
        styles.hashRow,
        pressed ? { backgroundColor: colors.surfaceHover } : null,
      ]}
    >
      <Txt variant="small" tone="secondary">
        Transaction
      </Txt>
      <View style={styles.hashValue}>
        <Txt variant="mono" numberOfLines={1}>
          {truncateHash(hash)}
        </Txt>
        <Txt variant="caption" tone="secondary" accessibilityLiveRegion="polite">
          {copied ? 'Copied' : 'Copy'}
        </Txt>
      </View>
    </Pressable>
  );
}

/**
 * "12 Nov 2025, 19:40", or an em dash.
 *
 * Same `try/catch` as the feed's day headers: an unusual locale build can still
 * throw, and a thrown formatter on a receipt is a blank screen.
 */
function absolute(iso: string | null): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '—';

  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
      parsed,
    );
  } catch {
    return new Date(parsed).toISOString();
  }
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: space.md },
  /** Pulled to the gutter: a text button's own padding would inset it past it. */
  back: { paddingHorizontal: 0 },
  scroll: { gap: space.lg, paddingBottom: space.xxl },

  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  identityTitle: { flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },

  money: { gap: space.xs },

  rows: { gap: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  /** Right-aligned, because a column of values that starts in a different place each row is a list. */
  value: { textAlign: 'right', flexShrink: 1 },
  /** Bleeds into the card's padding so the pressed fill covers the whole row. */
  hashRow: {
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    marginVertical: -space.sm,
    borderRadius: radius.control,
  },
  hashValue: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },

  skeleton: { gap: space.lg },
  skeletonBlock: { borderRadius: radius.control },
});
