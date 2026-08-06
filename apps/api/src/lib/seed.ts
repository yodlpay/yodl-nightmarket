/**
 * Demo data, so the app has a market to walk through before a real webhook lands.
 *
 * The stalls are drawn from the four countries Yodl QR payments are live in —
 * Brazil, Argentina, Vietnam and the Philippines — because the currency codes and
 * amount magnitudes are the thing a payment feed actually has to survive. A VND
 * invoice is six figures; an ARS one is five with a fast-moving settlement rate.
 * Seeding with USD-shaped numbers would hide every layout bug that matters.
 *
 * Off unless `NIGHTMARKET_SEED=1`, and never applied to a store that already has
 * rows — a seed that overwrites live data is a footgun waiting for the one
 * afternoon you forget the flag is set.
 */

import type { NightmarketPayment } from '@nightmarket/shared';
import { type Hash, numberToHex } from 'viem';

/** A wallet the demo pretends is ours, so seeded rows can be `matched`. */
export const DEMO_WALLET = '0x000000000000000000000000000000000000c0de';

interface Stall {
  title: string;
  subtitle: string;
  currency: string;
  amount: string;
  settlement: string;
  chainId: string;
  state: NightmarketPayment['state'];
  minutesAgo: number;
  /** `false` produces a delivery with no matching intent — someone else's payment. */
  ours: boolean;
}

const STALLS: Stall[] = [
  {
    title: 'Bánh Mì Cô Ba',
    subtitle: 'Vietcombank 0123',
    currency: 'VND',
    amount: '45000',
    settlement: '1.72',
    chainId: '8453',
    state: 'success',
    minutesAgo: 6,
    ours: true,
  },
  {
    title: 'Feira do Bixiga — Pastel',
    subtitle: 'Nubank •••• 4471',
    currency: 'BRL',
    amount: '18.50',
    settlement: '3.41',
    chainId: '8453',
    state: 'success',
    minutesAgo: 34,
    ours: true,
  },
  {
    title: 'Parrilla Don Ernesto',
    subtitle: 'Mercado Pago',
    currency: 'ARS',
    amount: '14200',
    settlement: '11.86',
    chainId: '42161',
    state: 'pending',
    minutesAgo: 2,
    ours: true,
  },
  {
    title: 'Tita’s Isaw & Rice',
    subtitle: 'GCash 0917•••4402',
    currency: 'PHP',
    amount: '260',
    settlement: '4.45',
    chainId: '8453',
    state: 'success',
    minutesAgo: 190,
    ours: true,
  },
  {
    title: 'Cà Phê Sữa Đá — Ngõ 12',
    subtitle: 'Techcombank 8890',
    currency: 'VND',
    amount: '30000',
    settlement: '1.15',
    chainId: '8453',
    state: 'refund_success',
    minutesAgo: 1_460,
    ours: true,
  },
  {
    // No intent behind this one: a delivery that claimed our integration address
    // and that we cannot match to anything our app did. The feed must not show it
    // as the user's, and the demo is better for having one.
    title: 'Kiosko 24h',
    subtitle: null as unknown as string,
    currency: 'ARS',
    amount: '3800',
    settlement: '3.17',
    chainId: '42161',
    state: 'success',
    minutesAgo: 51,
    ours: false,
  },
];

/**
 * Deterministic pseudo-hash, so a reseed produces the same rows and not duplicates.
 *
 * `size: 32` is the entire reason this uses viem: a transaction hash is 32 bytes,
 * and the hand-rolled version that stood here padded and repeated a hex word by
 * hand — which produced a 72-character "hash" the first time the multiply
 * overflowed, and carried a comment explaining the `>>> 0` that patched it.
 * `numberToHex` pads to the size it is given and throws if the value will not
 * fit, so the failure mode is a loud one rather than a wrong-length string that
 * flows into the store.
 */
function fakeHash(index: number): Hash {
  return numberToHex((index + 1) * 0x9e3779b1, { size: 32 });
}

export function buildSeedPayments(now = Date.now()): NightmarketPayment[] {
  return STALLS.map((stall, index) => {
    const at = new Date(now - stall.minutesAgo * 60_000).toISOString();
    return {
      chainId: stall.chainId,
      txHash: fakeHash(index),
      version: 3,
      state: stall.state,
      recipient: { title: stall.title, subtitle: stall.subtitle ?? null },
      invoice: {
        amount: stall.amount,
        currency: stall.currency,
        settlementAmount: stall.settlement,
        settlementCurrency: 'USD',
      },
      attribution: stall.ours ? 'matched' : 'unmatched',
      wallet: stall.ours ? DEMO_WALLET : null,
      intentAt: stall.ours ? new Date(now - stall.minutesAgo * 60_000 - 4_000).toISOString() : null,
      notifiedAt: at,
    } satisfies NightmarketPayment;
  });
}
