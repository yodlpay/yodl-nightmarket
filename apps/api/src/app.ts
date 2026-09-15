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
import { openfortSession, openfortSessionEmail, shieldEncryptionSession } from './lib/openfort';
import type { PaymentStore } from './lib/store';
import { SumsubKycClient } from './lib/sumsub';
import { attestationRoutes, jwksRoute } from './routes/attestation';
import { kycRoutes } from './routes/kyc';
import { openfortRoutes } from './routes/openfort';
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

  // Same optional-capability contract: no Sumsub sandbox credentials, no donor
  // KYC — the /v1/kyc routes answer 501 instead of the server refusing to boot.
  const sumsub =
    env.SUMSUB_APP_TOKEN && env.SUMSUB_SECRET_KEY
      ? new SumsubKycClient({
          appToken: env.SUMSUB_APP_TOKEN,
          baseUrl: env.SUMSUB_API_BASE_URL,
          levelName: env.SUMSUB_LEVEL_NAME,
          secretKey: env.SUMSUB_SECRET_KEY,
          shareForClientId: env.SUMSUB_SHARE_FOR_CLIENT_ID,
        })
      : null;

  /**
   * Who is calling, in the two shapes the routes want it.
   *
   * `resolveVerifiedEmail` is the other half of attestation, and the one that
   * decides *whose* email gets signed. Same rule as the signer: an unset key
   * switches the capability off rather than stopping the boot. Both halves are
   * required — a signer with no way to authenticate the caller would sign for
   * anyone who asked. `resolveSession` is the same lookup without the email, for
   * the route below that only needs to know somebody real is asking.
   */
  const openfort = env.OPENFORT_PUBLISHABLE_KEY
    ? { publishableKey: env.OPENFORT_PUBLISHABLE_KEY }
    : null;
  const resolveSession = openfort ? openfortSession(openfort) : undefined;
  const resolveVerifiedEmail = openfort ? openfortSessionEmail(openfort) : undefined;

  /**
   * Minting Shield encryption sessions, which is what makes the app's wallets
   * recoverable on a second device. All three values or none: the secret key and
   * the encryption share are useless apart, and a half-configured Shield would
   * fail at wallet creation rather than at boot.
   */
  const mintEncryptionSession =
    env.OPENFORT_SHIELD_PUBLISHABLE_KEY &&
    env.OPENFORT_SHIELD_SECRET_KEY &&
    env.OPENFORT_SHIELD_ENCRYPTION_SHARE
      ? shieldEncryptionSession({
          shieldPublishableKey: env.OPENFORT_SHIELD_PUBLISHABLE_KEY,
          shieldSecretKey: env.OPENFORT_SHIELD_SECRET_KEY,
          encryptionShare: env.OPENFORT_SHIELD_ENCRYPTION_SHARE,
        })
      : undefined;

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
        kyc: sumsub !== null,
        emailAttestation: signer !== null && resolveVerifiedEmail !== undefined,
      },
    }),
  );

  app.route('/webhooks', webhookRoutes(env, store));
  app.route('/v1', paymentRoutes(store));
  app.route('/v1/kyc', kycRoutes(sumsub));
  app.route('/v1/attestations', attestationRoutes({ signer, resolveVerifiedEmail }));
  app.route('/v1/openfort', openfortRoutes({ resolveSession, mintEncryptionSession }));
  app.route('/.well-known', jwksRoute(signer));

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  app.onError((error, c) => {
    console.error('[api] unhandled error:', error);
    return c.json({ error: 'Internal error' }, 500);
  });

  return app;
}
