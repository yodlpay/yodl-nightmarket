/**
 * `POST /v1/openfort/encryption-session` — the one server-side step in owning an
 * embedded wallet.
 *
 * The app's wallets use automatic recovery, which is what lets signing in on a
 * second device hand the user back the same address with nothing to remember and
 * nothing to set up. The mechanics: Shield holds one encrypted half of the
 * wallet's key material and will only release it against a single-use encryption
 * session. Minting one takes the Shield secret key and our encryption share, and
 * neither may ever be inlined into a bundle — a copy of the pair is a copy of
 * every user's wallet. So the mint happens here, and the device receives only the
 * session id, which is spent on one recovery and worthless afterwards.
 *
 * Which is why the route is gated on a live Openfort session. The React Native
 * SDK can call an encryption-session endpoint by itself, but that mode posts
 * `{ otp_code, user_id }` with no `Authorization` header at all, so a route
 * written for it would mint sessions for anyone who learned the URL. The app uses
 * the `walletConfig.getEncryptionSession` callback instead, which lets it attach
 * the caller's access token, and this route declines without one.
 *
 * https://www.openfort.io/docs/products/embedded-wallet/react-native/
 */

import { Hono } from 'hono';
import type { MintEncryptionSession, ResolveSession } from '../lib/openfort';

export interface OpenfortRouteOptions {
  /**
   * Who is asking. Omitted → the route mints nothing, because a session it
   * cannot authenticate is one it must not spend Shield credentials on.
   */
  resolveSession?: ResolveSession;
  /** Omitted → Shield is unconfigured and the capability is off. */
  mintEncryptionSession?: MintEncryptionSession;
}

export function openfortRoutes({ resolveSession, mintEncryptionSession }: OpenfortRouteOptions) {
  const app = new Hono();

  app.post('/encryption-session', async (c) => {
    // 501 rather than 404: the route exists, this server just isn't equipped for
    // it. Same contract as /v1/kyc. Both halves count as equipment — an unset
    // publishable key leaves no way to tell one caller from another, and minting
    // for an unknown caller is the failure this route is shaped to prevent.
    if (!mintEncryptionSession || !resolveSession) {
      console.log(
        '[openfort] encryption session unavailable: OPENFORT_PUBLISHABLE_KEY or OPENFORT_SHIELD_* unset',
      );
      return c.json({ error: 'Wallet recovery is not configured' }, 501);
    }

    const session = await resolveSession(c.req.header('Authorization'));
    if (!session) {
      // Unlike attestation, a decline here is not a fallback — there is no wallet
      // without it — so it is a 401 the app can show rather than a quiet 404.
      return c.json({ error: 'No Openfort session for this request' }, 401);
    }

    try {
      const encryptionSession = await mintEncryptionSession();
      console.log(`[openfort] minted an encryption session for ${session.userId}`);
      return c.json({ session: encryptionSession });
    } catch (cause) {
      // Ours is the only log that will name Shield; the device sees a 502 and
      // whatever the SDK makes of a wallet it could not recover.
      console.error(`[openfort] Shield declined for ${session.userId}:`, cause);
      return c.json({ error: 'Could not mint an encryption session' }, 502);
    }
  });

  return app;
}
