/**
 * The reconciliation join, end to end through the real routes.
 *
 * These are the cases the Yodl docs describe in prose, turned into assertions:
 * deliveries are unordered and repeat, and a delivery is a claim rather than
 * proof of your sale. If the store ever stops distinguishing "our payment" from
 * "a payment that named us", this file is what says so.
 */

import type { PaymentNotification } from '@nightmarket/shared';
import { paymentPageSchema, statsSchema } from '@nightmarket/shared';
import { getAddress } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/env';
import { signYodlDelivery } from '../src/lib/signature';
import { PaymentStore } from '../src/lib/store';

const SECRET = 'test-signing-secret';
const INTEGRATION = '0x5f2f6f387f49f7cfe0f6f302ff7f6ba6748b6ff1';
const WALLET = '0x000000000000000000000000000000000000c0de';
const TX = `0x${'11'.repeat(32)}`;

const env = loadEnv({
  NODE_ENV: 'test',
  YODL_INTEGRATION_ADDRESS: INTEGRATION,
  YODL_WEBHOOK_SIGNING_SECRET: SECRET,
  NIGHTMARKET_DATA_FILE: ':memory:',
});

let store: PaymentStore;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = new PaymentStore(':memory:');
  app = createApp({ env, store });
});

function delivery(overrides: Partial<PaymentNotification> = {}) {
  const payload: PaymentNotification = {
    integrationAddress: INTEGRATION,
    chainId: '8453',
    txHash: TX,
    version: 1,
    state: 'pending',
    recipient: { title: 'Bánh Mì Cô Ba', subtitle: 'Vietcombank 0123' },
    invoice: {
      amount: '45000',
      currency: 'VND',
      settlementAmount: '1.72',
      settlementCurrency: 'USD',
    },
    ...overrides,
  };

  // Sign the bytes that will actually be sent — not a re-stringify of the object.
  const body = JSON.stringify(payload);
  return {
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Yodl-Integration': INTEGRATION,
      'X-Yodl-Signature': signYodlDelivery(body, SECRET, Math.floor(Date.now() / 1000)),
    },
  };
}

const post = (path: string, init: RequestInit) => app.request(path, { method: 'POST', ...init });

const sendDelivery = (overrides?: Partial<PaymentNotification>) => {
  const { body, headers } = delivery(overrides);
  return post('/webhooks/yodl', { body, headers });
};

/**
 * Read a response through the schema the app will parse it with. A cast would
 * satisfy the compiler; this also fails if a route ever drifts from the published
 * contract in `@nightmarket/shared`, which is the failure worth catching.
 */
const readPage = async (response: Response) => paymentPageSchema.parse(await response.json());
const readStats = async (response: Response) => statsSchema.parse(await response.json());

const sendIntent = (txHash = TX) =>
  post('/v1/intents', {
    body: JSON.stringify({ chainId: '8453', txHash, wallet: WALLET }),
    headers: { 'Content-Type': 'application/json' },
  });

describe('webhook gates', () => {
  it('rejects an unsigned delivery', async () => {
    const { body } = delivery();
    const response = await post('/webhooks/yodl', {
      body,
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(401);
    expect(store.size).toBe(0);
  });

  it('rejects a delivery addressed to another integration before verifying it', async () => {
    const { body, headers } = delivery();
    const response = await post('/webhooks/yodl', {
      body,
      headers: { ...headers, 'X-Yodl-Integration': `0x${'ff'.repeat(20)}` },
    });

    expect(response.status).toBe(404);
  });

  it('accepts a signed delivery', async () => {
    const response = await sendDelivery();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, applied: true });
  });

  it('returns 2xx for a replay rather than an error', async () => {
    // Yodl records a non-2xx as a delivery failure. A duplicate is not a failure —
    // we already knew. Answering 409 here would make their retry graph lie.
    await sendDelivery({ version: 2 });
    const replay = await sendDelivery({ version: 2 });

    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ applied: false, reason: 'stale_version' });
  });

  it('keeps the newer snapshot when an older one arrives late', async () => {
    await sendDelivery({ version: 5, state: 'success' });
    await sendDelivery({ version: 4, state: 'pending' });

    expect(store.get('8453', TX)).toMatchObject({ version: 5, state: 'success' });
  });
});

describe('attribution', () => {
  it('marks a delivery with no intent behind it as unmatched', async () => {
    await sendDelivery({ state: 'success' });
    expect(store.get('8453', TX)?.attribution).toBe('unmatched');
  });

  it('marks a delivery as matched when our app claimed the hash first', async () => {
    await sendIntent();
    await sendDelivery({ state: 'success' });

    expect(store.get('8453', TX)).toMatchObject({ attribution: 'matched', wallet: WALLET });
  });

  it('upgrades an unmatched delivery when the intent arrives afterwards', async () => {
    // Yodl can index faster than our own request completes, so this ordering is
    // real, not hypothetical — and it is the reason unmatched rows are kept.
    await sendDelivery({ state: 'success' });
    await sendIntent();

    expect(store.get('8453', TX)).toMatchObject({ attribution: 'matched', wallet: WALLET });
  });

  it('keeps unmatched payments out of a wallet feed', async () => {
    await sendIntent();
    await sendDelivery({ state: 'success' });
    await sendDelivery({ txHash: `0x${'22'.repeat(32)}`, version: 1, state: 'success' });

    const feed = await readPage(await app.request(`/v1/wallets/${WALLET}/payments`));
    expect(feed.payments).toHaveLength(1);
    expect(feed.payments[0]?.txHash).toBe(TX);

    const unmatched = await readPage(await app.request('/v1/payments/unmatched'));
    expect(unmatched.payments).toHaveLength(1);
  });

  it('finds a wallet feed by the checksummed form of the same address', async () => {
    await sendIntent();
    await sendDelivery({ state: 'success' });

    // The two forms that actually meet here: Privy hands the app an EIP-55
    // checksummed address, and the store keeps the lowercase one Yodl uses. That
    // they resolve to the same feed was a property of two matching `toLowerCase`
    // calls in different files and nothing said so — this is the test that says
    // so, and the reason the filter now asks viem instead.
    const feed = await readPage(await app.request(`/v1/wallets/${getAddress(WALLET)}/payments`));
    expect(feed.payments).toHaveLength(1);
    expect(feed.payments[0]?.txHash).toBe(TX);
  });

  it('is idempotent on repeated intents', async () => {
    await sendIntent();
    await sendDelivery({ version: 3, state: 'success' });
    await sendIntent();

    expect(store.get('8453', TX)).toMatchObject({ attribution: 'matched', version: 3 });
  });

  it('rejects an intent whose hash is not a transaction hash', async () => {
    const response = await post('/v1/intents', {
      body: JSON.stringify({ chainId: '8453', txHash: '0xdeadbeef', wallet: WALLET }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status).toBe(400);
  });
});

describe('stats', () => {
  it('sums settlement only for payments we can prove we originated', async () => {
    await sendIntent();
    await sendDelivery({ state: 'success' });

    // Same amount, no intent — must not be counted as our revenue.
    await sendDelivery({ txHash: `0x${'33'.repeat(32)}`, state: 'success' });

    const stats = await readStats(await app.request('/v1/stats'));
    expect(stats.matched).toBe(1);
    expect(stats.unmatched).toBe(1);
    expect(stats.settled.USD).toBe('1.72');
  });
});

/**
 * Webhook-only attribution, and the edge it cannot cover.
 *
 * A notification carries Yodl's destination chain and hash and nothing else — there
 * is no source field in the payload — while our intent is keyed on the hash the
 * app's own wallet broadcast. Same-chain those are one string. Bridged they are two,
 * and nothing in the delivery can join them, so the payment is attributed to nobody.
 * Asserted rather than commented so it stays a known limitation instead of a
 * surprise.
 */
describe('source/destination identity', () => {
  const SOURCE_TX = `0x${'aa'.repeat(32)}`;
  const DEST_TX = `0x${'bb'.repeat(32)}`;

  it('matches a same-chain payment, where the delivery and the intent share a hash', async () => {
    await sendIntent(DEST_TX);
    await sendDelivery({ txHash: DEST_TX, state: 'success' });

    const payment = store.get('8453', DEST_TX);
    expect(payment?.attribution).toBe('matched');
    expect(payment?.state).toBe('success');
    expect(payment?.wallet).toBe(WALLET);
  });

  it('cannot attribute a bridged payment, and files it unmatched', async () => {
    // What the app knows: the hash it broadcast, on the source chain.
    await post('/v1/intents', {
      body: JSON.stringify({ chainId: '42161', txHash: SOURCE_TX, wallet: WALLET }),
      headers: { 'Content-Type': 'application/json' },
    });
    // What Yodl sends: the destination pair, with no way back to the source.
    await sendDelivery({ txHash: DEST_TX, state: 'success' });

    expect(store.get('8453', DEST_TX)?.attribution).toBe('unmatched');
    // The intent is still there, still waiting for a delivery that will never key to it.
    const intent = store.get('42161', SOURCE_TX);
    expect(intent?.attribution).toBe('pending');
    expect(intent?.state).toBeNull();
  });
});

/**
 * Cursor paging, which the app's feed now depends on.
 *
 * `/v1/wallets/:address/payments` has always answered 25 rows and a `nextCursor`;
 * the app read the first page and stopped, so a wallet with more than 25 payments
 * had a feed that ended without saying so. Now that `useInfiniteQuery` follows the
 * cursor, these are the two properties it relies on and neither was asserted
 * anywhere: that the last page reports `null`, and that no row is served twice.
 *
 * The duplicate check is the one that matters. The cursor is the sort key of the
 * last row returned, so a sort key that is not unique — two payments in the same
 * millisecond, which is exactly what a seeded demo produces — would silently
 * repeat or skip rows at every page boundary.
 */
describe('wallet feed pagination', () => {
  const PAGE = 25;
  const TOTAL = 60;

  beforeEach(() => {
    store.seed(
      Array.from({ length: TOTAL }, (_, index) => ({
        chainId: '8453',
        txHash: `0x${index.toString(16).padStart(2, '0').repeat(32)}`,
        version: 1,
        state: 'success' as const,
        recipient: { title: `Stall ${index}`, subtitle: null },
        invoice: {
          amount: '45000',
          currency: 'VND',
          settlementAmount: '1.72',
          settlementCurrency: 'USD',
        },
        attribution: 'matched' as const,
        wallet: WALLET,
        intentAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString(),
        // Deliberately coarse: whole minutes, so several rows share a timestamp
        // and the tie-break in the sort key is what has to keep them ordered.
        notifiedAt: new Date(Date.UTC(2026, 0, 1, 0, Math.floor(index / 4), 0)).toISOString(),
      })),
    );
  });

  it('walks every payment exactly once, and stops', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let requests = 0;

    do {
      const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const page = await readPage(await app.request(`/v1/wallets/${WALLET}/payments${query}`));

      expect(page.payments.length).toBeLessThanOrEqual(PAGE);
      seen.push(...page.payments.map((payment) => payment.txHash));
      cursor = page.nextCursor;
      requests += 1;
      // A cursor that never advances is an infinite scroll that never ends.
      expect(requests).toBeLessThanOrEqual(Math.ceil(TOTAL / PAGE) + 1);
    } while (cursor !== null);

    expect(seen).toHaveLength(TOTAL);
    expect(new Set(seen).size).toBe(TOTAL);
  });

  it('reports no cursor on the last page', async () => {
    const first = await readPage(await app.request(`/v1/wallets/${WALLET}/payments`));
    expect(first.payments).toHaveLength(PAGE);
    expect(first.nextCursor).not.toBeNull();

    const last = await readPage(
      await app.request(`/v1/wallets/${WALLET}/payments?cursor=${first.nextCursor}&limit=100`),
    );
    expect(last.payments).toHaveLength(TOTAL - PAGE);
    expect(last.nextCursor).toBeNull();
  });
});
