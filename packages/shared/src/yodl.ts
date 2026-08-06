/**
 * Yodl's wire shapes, as Zod schemas.
 *
 * These describe data Yodl sends us — a signed webhook delivery, or a row from
 * the Payments API. Both carry the same seven fields; the API adds the on-chain
 * context a read endpoint needs and a push doesn't.
 *
 *   https://docs.yodl.me/integrations/notifications
 *   https://docs.yodl.me/integrations/payments-api
 *
 * Two things the schemas encode that are easy to get wrong:
 *
 *  - **Every amount is a string.** Yodl sends them as strings so they survive a
 *    round trip without a float in the middle. `z.string()` here is a decision,
 *    not laziness — coercing to number would quietly lose precision on a
 *    VND invoice, and `12345` is not the same value as `12345.0000001`.
 *  - **`invoice` is all-or-nothing.** It's `null` unless all four of its fields
 *    are known, so there is no "amount but no currency" state to handle.
 */

import { z } from 'zod';

/** Lifecycle of a payment, including the refund branch. */
export const paymentStateSchema = z.enum([
  'pending',
  'success',
  'failure',
  'refund_pending',
  'refund_success',
  'refund_failure',
]);
export type PaymentState = z.infer<typeof paymentStateSchema>;

/** States that will never change again. Everything else is still moving. */
export const TERMINAL_STATES: readonly PaymentState[] = [
  'success',
  'failure',
  'refund_success',
  'refund_failure',
];

export const isTerminalState = (state: PaymentState | null): boolean =>
  state !== null && TERMINAL_STATES.includes(state);

/** The merchant behind the QR. `null` until a name is known. */
export const recipientSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable().optional(),
});

/** What the merchant asked for, and what actually settled on chain. */
export const invoiceSchema = z.object({
  amount: z.string(),
  currency: z.string(),
  settlementAmount: z.string(),
  settlementCurrency: z.string(),
});

/**
 * The payment notification payload — a full snapshot, never a patch.
 *
 * Unrecognised keys pass through rather than failing: Yodl can add fields to a
 * snapshot without that being a breaking change, and a webhook handler that 400s
 * on an unknown key is a webhook handler that breaks on someone else's deploy.
 */
export const paymentNotificationSchema = z.object({
  integrationAddress: z.string(),
  chainId: z.string(),
  txHash: z.string(),
  /** Monotonic per payment. The replay/ordering gate — see `isNewerSnapshot`. */
  version: z.number().int(),
  state: paymentStateSchema.nullable(),
  recipient: recipientSchema.nullable(),
  invoice: invoiceSchema.nullable(),
});
export type PaymentNotification = z.infer<typeof paymentNotificationSchema>;

const tokenInSchema = z.object({
  address: z.string(),
  symbol: z.string().nullable(),
  amount: z.string(),
});

const tokenOutSchema = z.object({
  address: z.string(),
  symbol: z.string().nullable(),
  amountGross: z.string(),
  amountNet: z.string(),
});

/** A row from the Payments API: the notification payload plus on-chain context. */
export const yodlPaymentSchema = paymentNotificationSchema.extend({
  sender: z.string(),
  receiver: z.string(),
  memo: z.string().nullable().optional(),
  blockTimestamp: z.string(),
  source: z.object({ chainId: z.string(), txHash: z.string() }).nullable().optional(),
  tokenIn: tokenInSchema.nullable().optional(),
  tokenOut: tokenOutSchema.nullable().optional(),
});
export type YodlPayment = z.infer<typeof yodlPaymentSchema>;

export const yodlPaymentPageSchema = z.object({
  payments: z.array(yodlPaymentSchema),
  nextCursor: z.string().nullable().optional(),
});
export type YodlPaymentPage = z.infer<typeof yodlPaymentPageSchema>;

/**
 * `chainId` + `txHash` identifies a payment; adding `version` identifies a
 * snapshot of it. Lowercased because Yodl lowercases identifiers on the way out
 * and we want one canonical form to key on.
 */
export const paymentKey = (chainId: string, txHash: string): string =>
  `${chainId}:${txHash.toLowerCase()}`;

/**
 * Deliveries are not ordered: the same payment can arrive twice, and a later
 * state can land before an earlier one. Accept a snapshot only if it is strictly
 * newer than what we already hold.
 */
export const isNewerSnapshot = (
  incomingVersion: number,
  storedVersion: number | undefined,
): boolean => storedVersion === undefined || incomingVersion > storedVersion;
