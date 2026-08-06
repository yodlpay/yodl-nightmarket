/**
 * `POST /webhooks/yodl` — the signed payment notification endpoint.
 *
 * https://docs.yodl.me/integrations/notifications
 *
 * The order of the gates is the interesting part, and it is not arbitrary:
 *
 *   1. **Read the raw body first.** Before any parsing. The signature covers the
 *      exact bytes that arrived, and `JSON.stringify(parsed)` is not those bytes.
 *   2. **Route by `X-Yodl-Integration`, don't trust it.** It exists so an endpoint
 *      serving several integrations can pick the right signing secret *before*
 *      verifying. It is an unauthenticated hint — only the signature proves anything.
 *   3. **Verify.**
 *   4. **Then parse.** A body that failed step 3 is never handed to a parser.
 *   5. **Then version-gate.** Deliveries are unordered and can repeat.
 *
 * Everything Yodl considers a success is a `2xx`; anything else is recorded as a
 * failure on their side, and they give up after 5 seconds. So a duplicate or a
 * stale snapshot returns 200 — it is not an error, we simply already knew. The
 * only non-2xx responses here are "this wasn't really from Yodl" and
 * "this isn't the payload you say it is".
 */

import { paymentNotificationSchema } from '@nightmarket/shared';
import { Hono } from 'hono';
import type { Env } from '../env';
import { verifyYodlSignature } from '../lib/signature';
import type { PaymentStore } from '../lib/store';

export function webhookRoutes(env: Env, store: PaymentStore) {
  const app = new Hono();

  app.post('/yodl', async (c) => {
    // (1) Raw bytes, before anything touches them.
    const rawBody = await c.req.text();

    // (2) A routing hint only. With one integration there is nothing to route,
    // but rejecting a delivery addressed elsewhere keeps the store honest if a
    // second integration is ever pointed at this URL by mistake.
    const addressedTo = c.req.header('X-Yodl-Integration')?.toLowerCase();
    if (addressedTo && addressedTo !== env.YODL_INTEGRATION_ADDRESS) {
      return c.json({ error: 'Unknown integration' }, 404);
    }

    // (3)
    const verified = verifyYodlSignature(
      c.req.header('X-Yodl-Signature'),
      rawBody,
      env.YODL_WEBHOOK_SIGNING_SECRET,
    );
    if (!verified.ok) {
      console.warn(`[webhook] rejected: ${verified.reason}`);
      return c.json({ error: 'Invalid signature', detail: verified.reason }, 401);
    }

    // (4)
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return c.json({ error: 'Malformed JSON' }, 400);
    }

    const parsed = paymentNotificationSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: 'Unexpected payload', detail: parsed.error.message }, 422);
    }

    // (5) A snapshot we already hold, or one that arrived out of order.
    const outcome = store.applyDelivery(parsed.data);
    if (!outcome.accepted) {
      console.log(
        `[webhook] ${parsed.data.txHash} v${parsed.data.version} dropped (${outcome.reason})`,
      );
      return c.json({ ok: true, applied: false, reason: outcome.reason });
    }

    console.log(
      `[webhook] ${parsed.data.txHash} v${parsed.data.version} → ${parsed.data.state ?? 'null'} (${outcome.payment.attribution})`,
    );
    return c.json({ ok: true, applied: true, attribution: outcome.payment.attribution });
  });

  return app;
}
