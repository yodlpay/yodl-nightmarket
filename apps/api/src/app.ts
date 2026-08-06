/**
 * The Hono app, as a factory.
 *
 * Nothing here reads `process.env` or opens a file — the caller passes an `Env`
 * and a hydrated store. That is what lets `test/` exercise real routes against a
 * `:memory:` store with a pinned clock, without a server ever listening.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './env';
import { AttestationSigner } from './lib/attestation';
import type { PaymentStore } from './lib/store';
import { attestationRoutes, jwksRoute } from './routes/attestation';
import { paymentRoutes } from './routes/payments';
import { webhookRoutes } from './routes/webhook';

export interface AppDeps {
  env: Env;
  store: PaymentStore;
}

export function createApp({ env, store }: AppDeps) {
  // An optional capability. Absent config disables the route rather than failing at
  // boot — a demo backend should start with nothing but a port.
  const signer = env.YODL_ATTESTATION_PRIVATE_KEY
    ? new AttestationSigner({
        privateKeyPem: env.YODL_ATTESTATION_PRIVATE_KEY,
        kid: env.YODL_ATTESTATION_KID,
        integrationAddress: env.YODL_INTEGRATION_ADDRESS,
      })
    : null;

  const app = new Hono();

  if (env.NODE_ENV !== 'test') app.use('*', logger());

  /**
   * Wide-open CORS, because in development the app is served from a rotating
   * Metro origin and, on a device, from no web origin at all. Narrow this to your
   * own origins before deploying: every route below is either public data or is
   * guarded by a signature, but that is an argument for the current design, not
   * for leaving the door open once there is a session cookie in play.
   */
  app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'] }));

  app.get('/health', (c) =>
    c.json({
      ok: true,
      service: 'nightmarket-api',
      integrationAddress: env.YODL_INTEGRATION_ADDRESS,
      payments: store.size,
      capabilities: {
        webhooks: true,
        emailAttestation: signer !== null,
      },
    }),
  );

  app.route('/webhooks', webhookRoutes(env, store));
  app.route('/v1', paymentRoutes(store));
  app.route('/v1/attestations', attestationRoutes({ signer }));
  app.route('/.well-known', jwksRoute(signer));

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  app.onError((error, c) => {
    console.error('[api] unhandled error:', error);
    return c.json({ error: 'Internal error' }, 500);
  });

  return app;
}
