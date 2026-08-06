/**
 * The read side, plus the one write the app makes.
 *
 * `POST /v1/intents` is the write. It is what makes reconciliation possible at
 * all: without our own record of what we sent, a webhook is just a claim from the
 * internet that happens to carry our integration address.
 */

import { createIntentSchema } from '@nightmarket/shared';
import { Hono } from 'hono';
import type { PaymentStore } from '../lib/store';

export function paymentRoutes(store: PaymentStore) {
  const app = new Hono();

  /**
   * Called from `<YodlPayment onTransactionSent>`. Fire-and-forget on the client:
   * a failure here costs the user nothing at the time, it only means the eventual
   * webhook won't have anything to match against, so the payment shows up as
   * `unmatched` rather than in their feed.
   */
  app.post('/intents', async (c) => {
    const parsed = createIntentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Invalid intent', detail: parsed.error.message }, 400);
    }

    const payment = store.recordIntent(parsed.data);
    console.log(`[intent] ${parsed.data.txHash} from ${parsed.data.wallet}`);
    return c.json({ ok: true, payment }, 201);
  });

  /** Deliveries we could not tie to anything our app did. Kept, and kept separate. */
  app.get('/payments/unmatched', (c) =>
    c.json(
      store.list({
        attribution: 'unmatched',
        limit: numeric(c.req.query('limit')),
        cursor: c.req.query('cursor') ?? null,
      }),
    ),
  );

  app.get('/payments', (c) =>
    c.json(
      store.list({
        wallet: c.req.query('wallet'),
        attribution: 'matched',
        limit: numeric(c.req.query('limit')),
        cursor: c.req.query('cursor') ?? null,
      }),
    ),
  );

  /**
   * One payment. The status screen polls this while a payment settles; what it is
   * waiting for is a webhook landing on the other route, not anything this one does.
   */
  app.get('/payments/:chainId/:txHash', (c) => {
    const payment = store.get(c.req.param('chainId'), c.req.param('txHash'));
    return payment ? c.json(payment) : c.json({ error: 'Not found' }, 404);
  });

  /**
   * The app's activity feed. `matched` and `pending` only — a wallet's feed shows
   * what that wallet did, and an unmatched delivery is by definition not that.
   *
   */
  app.get('/wallets/:address/payments', (c) =>
    c.json(
      store.list({
        wallet: c.req.param('address'),
        limit: numeric(c.req.query('limit')),
        cursor: c.req.query('cursor') ?? null,
      }),
    ),
  );

  app.get('/stats', (c) => c.json(store.stats()));

  return app;
}

function numeric(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
