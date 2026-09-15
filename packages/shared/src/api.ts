/**
 * The contract between the Expo app and the Nightmarket API.
 *
 * The shape of this file is driven by one line in the Yodl docs:
 *
 *   "A delivery proves that some payment *claimed* your integration address. It
 *    does not prove the payment came from your app. Reconcile against your own
 *    records before you credit anything."
 *
 * An integration address is written into on-chain metadata by whoever builds the
 * payment, so anyone can write ours. That makes a webhook an unauthenticated
 * claim, and it means the backend needs a second, independent record of what our
 * own app did — otherwise there is nothing to reconcile against.
 *
 * That record is an **intent**. When `<YodlPayment>` fires `onTransactionSent`,
 * the app posts the hash it just sent. When the webhook for that hash arrives,
 * the API joins the two on `chainId:txHash`:
 *
 *   intent + delivery  → `matched`   — our user, our payment, safe to show
 *   delivery alone     → `unmatched` — someone else claiming our address; noise
 *   intent alone       → `pending`   — sent, not yet indexed by Yodl
 *
 * The app's activity feed reads `matched` only. `unmatched` is kept and exposed
 * on a separate endpoint precisely so the demo can show that the two are
 * different things.
 */

import { isAddress, isHash } from 'viem';
import { z } from 'zod';
import { invoiceSchema, paymentStateSchema, recipientSchema } from './yodl';

/**
 * The two 0x shapes this API accepts, checked by viem rather than by a regex
 * written here.
 *
 * `strict: false` on the address is deliberate: it accepts either casing, where
 * the default would reject the lowercase form Yodl sends for failing EIP-55.
 * That is the common case, and rejecting it would be rejecting the correct
 * address for having the wrong capitalisation.
 */
const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), 'expected a 0x wallet address');

const txHashSchema = z.string().refine(isHash, 'expected a 32-byte 0x transaction hash');

/** How a stored payment relates to something our app actually did. */
export const attributionSchema = z.enum(['matched', 'unmatched', 'pending']);
export type Attribution = z.infer<typeof attributionSchema>;

/**
 * One payment as Nightmarket stores it: Yodl's snapshot, plus our own reconciliation
 * metadata. Yodl's fields are never merged with ours — `version` gates Yodl's half,
 * our half is written locally, and keeping them separable is what makes the join
 * auditable.
 */
export const nightmarketPaymentSchema = z.object({
  chainId: z.string(),
  txHash: z.string(),

  /** Yodl's snapshot version. Present only once a delivery has landed. */
  version: z.number().int().nullable(),
  state: paymentStateSchema.nullable(),
  recipient: recipientSchema.nullable(),
  invoice: invoiceSchema.nullable(),

  attribution: attributionSchema,
  /** The wallet that told us it sent this. Set from the intent, never from Yodl. */
  wallet: z.string().nullable(),
  /** ISO-8601. When our app said it sent the transaction. */
  intentAt: z.string().nullable(),
  /** ISO-8601. When the most recent accepted delivery landed. */
  notifiedAt: z.string().nullable(),
});
export type NightmarketPayment = z.infer<typeof nightmarketPaymentSchema>;

/**
 * The record an intent creates on its own, before any delivery has landed.
 *
 * One definition rather than two that agree today: the API writes this when an
 * intent arrives for a hash it has never seen, and the app writes the same
 * record into its query cache so the receipt has something to read before the
 * POST that creates the real one has finished.
 *
 * `intentAt` is the caller's because the two callers have different clocks — the
 * server stamps its own, the app the phone's, and the server's replaces the
 * app's the moment the real GET answers. Casing is the store's, which is what
 * everything downstream compares against.
 */
export function pendingPayment(input: {
  chainId: string;
  txHash: string;
  wallet: string;
  intentAt: string;
  /** Optional local echo of what the user was paying, for the pending row. */
  memo?: string;
}): NightmarketPayment {
  return {
    chainId: input.chainId,
    txHash: input.txHash.toLowerCase(),
    version: null,
    state: null,
    recipient: input.memo ? { title: input.memo, subtitle: null } : null,
    invoice: null,
    attribution: 'pending',
    wallet: input.wallet.toLowerCase(),
    intentAt: input.intentAt,
    notifiedAt: null,
  };
}

export const paymentPageSchema = z.object({
  payments: z.array(nightmarketPaymentSchema),
  nextCursor: z.string().nullable(),
});
export type PaymentPage = z.infer<typeof paymentPageSchema>;

/** Body of `POST /v1/intents`, sent the moment a transaction hash exists. */
export const createIntentSchema = z.object({
  chainId: z.string().min(1),
  txHash: txHashSchema,
  wallet: addressSchema,
  /** Optional local echo of what the user was paying, for the pending row. */
  memo: z.string().max(200).optional(),
});
export type CreateIntent = z.infer<typeof createIntentSchema>;

/** Home-screen aggregates. Cheap to compute, and the numbers say what the join did. */
export const statsSchema = z.object({
  /** Payments our app can prove it originated. */
  matched: z.number().int(),
  /** Sent by us, not yet seen by Yodl. */
  pending: z.number().int(),
  /** Deliveries claiming our integration address that we cannot match. */
  unmatched: z.number().int(),
  // Partial: a state nobody has reached yet is absent, not zero. `byState.failure`
  // reading `undefined` rather than `0` is the honest answer to "how many failed"
  // before any payment has failed.
  byState: z.partialRecord(paymentStateSchema, z.number().int()),
  /** Settlement currency → summed settlement amount, as a string. */
  settled: z.record(z.string(), z.string()),
  lastDeliveryAt: z.string().nullable(),
});
export type Stats = z.infer<typeof statsSchema>;

export const errorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});
export type ApiError = z.infer<typeof errorSchema>;

/**
 * Body of `POST /v1/attestations/email`.
 *
 * Backs `<YodlSignup fetchEmailAttestation>`: if our backend has already verified
 * this user's email, it mints a short-lived JWT asserting that and the user skips
 * Yodl's OTP. Minting is server-side only — the signing key never reaches a device.
 *
 * The wallet is the whole body. There was an optional `email` here once, and the
 * route signed it, which meant any caller could assert any email for any wallet.
 * The email now comes from the caller's Openfort session and the body has no say in
 * it, so the field is gone rather than merely ignored — a schema that still named
 * it would be documenting a channel that does not exist. An older client that
 * keeps sending one is unaffected: Zod strips unknown keys, so the value is
 * dropped at the door instead of 400ing the request.
 */
export const attestationRequestSchema = z.object({
  walletAddress: addressSchema,
});
export type AttestationRequest = z.infer<typeof attestationRequestSchema>;

export const attestationResponseSchema = z.object({
  token: z.string(),
  email: z.string().optional(),
});
export type AttestationResponse = z.infer<typeof attestationResponseSchema>;

/** Every route the app talks to, in one place, so a rename breaks both sides. */
export const routes = {
  health: '/health',
  intents: '/v1/intents',
  payments: '/v1/payments',
  payment: (chainId: string, txHash: string) => `/v1/payments/${chainId}/${txHash}`,
  walletPayments: (address: string) => `/v1/wallets/${address}/payments`,
  unmatched: '/v1/payments/unmatched',
  stats: '/v1/stats',
  emailAttestation: '/v1/attestations/email',
  encryptionSession: '/v1/openfort/encryption-session',
  yodlWebhook: '/webhooks/yodl',
} as const;
