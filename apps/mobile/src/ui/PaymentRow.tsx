/**
 * One payment in the feed.
 *
 * The hierarchy is: who you paid, then what it cost in *their* currency, then
 * everything else. The invoice amount leads and the settlement amount trails,
 * because "45,000 ₫" is the number the user recognises from the stall's sign —
 * "$1.72" is the number their wallet moved, and they only care about it second.
 * The two are stacked, invoice over settlement.
 *
 * A row, not a card. No divider under it either: the day-group headers, the 68pt
 * rhythm and the avatar column do the separating, and a hairline rule under every
 * row is a list pretending to be a table.
 *
 * **Nothing on this row is a pill and nothing on it is tinted.** The old version
 * mapped every state to a colour — amber for pending, cyan for refunds, a
 * saturated chain dot on the avatar — which is three colour systems fighting on a
 * 64pt row. Now: the state is a word, the chain is a word, and the only colour
 * `error` is the only colour that can appear, because a failure should not read
 * as a successful payment with different wording.
 *
 * That is also the accessibility position, not a compromise with it. A red/green
 * pair is the single most common thing colour-blind users lose, and these states
 * are not a good/bad axis anyway: `refund_success` is a *good* refund, and
 * painting it green next to a green payment would be worse than useless.
 *
 * A payment we have an intent for but no delivery yet renders as "sent" with a
 * dash where the settlement goes. That state is real and lasts a
 * few seconds; a blank row or a zero would be worse than admitting we know it's
 * out there.
 */

import type { NightmarketPayment, PaymentState } from '@nightmarket/shared';
import { chainName, formatAmount, relativeTime } from '@nightmarket/shared';
import { radius, space } from '@nightmarket/theme';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconChevron } from './Icon';
import { Txt } from './Txt';
import { useColors } from './theme';

/** Yodl's states, plus ours: sent by this app, not yet indexed by Yodl. */
export type RowState = PaymentState | 'awaiting';

/**
 * Exported, because the payment detail screen renders the same three decisions
 * one route away and a second copy of this map is how a row and its detail end
 * up disagreeing about what "refunding" is called. The row is where these were
 * decided, so the row keeps them.
 */
export const LABELS: Record<RowState, string> = {
  awaiting: 'sent',
  pending: 'in flight',
  success: 'paid',
  failure: 'failed',
  refund_pending: 'refunding',
  refund_success: 'refunded',
  refund_failure: 'refund failed',
};

/** Settlement is only real once money has finished moving. */
export const SETTLED: ReadonlySet<RowState> = new Set<RowState>(['success', 'refund_success']);

/** The only states the app is allowed to paint, and both of them are failures. */
export const FAILED: ReadonlySet<RowState> = new Set<RowState>(['failure', 'refund_failure']);

/**
 * Who the row says you paid, exported for the same reason `LABELS` is.
 *
 * `awaiting` means we posted the hash and no delivery has arrived yet, so the payee
 * is not unknown — it is not known *yet*. "Unknown stall" for that reads as a
 * payment to nobody, and its initial "U" reads as a merchant whose name starts with
 * U. That label is right only once a delivery arrives carrying no title.
 */
export function payee(payment: NightmarketPayment, state: RowState) {
  const known = payment.recipient?.title;
  return {
    title: known ?? (state === 'awaiting' ? 'Awaiting confirmation' : 'Unknown stall'),
    initial: known ? known.trim().charAt(0).toUpperCase() || '?' : '?',
  };
}

export function PaymentRow({
  payment,
  onPress,
}: {
  payment: NightmarketPayment;
  onPress?: () => void;
}) {
  const colors = useColors();
  const state: RowState = payment.state ?? 'awaiting';

  const { title, initial } = payee(payment, state);
  const when = relativeTime(payment.notifiedAt ?? payment.intentAt);
  const invoice = payment.invoice;
  const amount = invoice ? formatAmount(invoice.amount, invoice.currency) : null;
  const settlement = invoice
    ? formatAmount(invoice.settlementAmount, invoice.settlementCurrency)
    : null;
  const settled = SETTLED.has(state) && settlement !== null;

  // Spoken as a sentence: "45,000 dong, settles to 1 dollar 72, paid, Base, 4
  // minutes ago" — the two numerals alone would be read as an unrelated pair.
  const label = [
    title,
    amount ?? 'amount not known yet',
    settled && settlement ? `settles to ${settlement}` : 'not settled yet',
    LABELS[state],
    chainName(payment.chainId),
    when,
  ].join(', ');

  const body = (
    <>
      {/* A 40pt rounded square, not a circle. A circular avatar next to a
          circular status dot is half of what dates a payment feed — and
          `radius.full` belongs to the primary CTA alone. */}
      <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
        <Txt variant="bodyStrong" tone="secondary">
          {initial}
        </Txt>
      </View>

      <View style={styles.middle}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {title}
        </Txt>
        {/* The chain used to be a coloured dot on the avatar. It is a word now,
            which is what the accessible label always said it was. */}
        <Txt variant="small" tone={FAILED.has(state) ? 'error' : 'secondary'} numberOfLines={1}>
          {LABELS[state]} · {chainName(payment.chainId)} · {when}
        </Txt>
      </View>

      <View style={styles.trailing}>
        <Txt variant="amountRow" numberOfLines={1} style={styles.amount}>
          {amount ?? '—'}
        </Txt>
        {/* The settlement amount, plain. It used to carry two accent bars that
            lit when the money landed; the same mark at hero size read as a
            glitch, and a device that only works at one size is not a system.
            Settled state is the status word in the line above. */}
        <Txt variant="mono" tone={settled ? 'secondary' : 'muted'} numberOfLines={1}>
          {settlement ?? '—'}
        </Txt>
      </View>
    </>
  );

  // A row with no `onPress` is static text, not a dead button. Rendering a
  // `Pressable` with `disabled` made every row announce itself as unavailable —
  // React Native folds `disabled` into `accessibilityState`, and nothing in the
  // app passes `onPress` today, so the entire feed read as dimmed.
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={styles.row}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceHover, borderRadius: radius.control } : null,
      ]}
    >
      {body}
      <IconChevron size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    // 68pt of rhythm is what replaces the divider that used to sit under here.
    minHeight: 68,
    paddingVertical: space.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, gap: 2 },
  /** Right-aligned, because tabular figures are a request and this is the mechanism. */
  trailing: { alignItems: 'flex-end', gap: space.xs },
  amount: { textAlign: 'right' },
});
