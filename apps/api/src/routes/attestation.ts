/**
 * `POST /v1/attestations/email` and the JWKS document that lets Yodl verify it.
 *
 * https://docs.yodl.me/integrations/email-attestation
 *
 * ── Where the email comes from ────────────────────────────────────────────────
 *
 * From the attester, and from nowhere else. This route authenticates the caller —
 * an Openfort access token on the `Authorization` header — and then signs the email
 * *it* has on file for that user. It never signs an email the client sent it.
 *
 * The body once carried a `claimedEmail` that got signed as-is, which was fine for
 * a demo and a privilege-escalation bug in anything real: any caller could assert
 * any email for any wallet, and the OTP step that exists to prevent exactly that
 * would be skipped. The seam that used to be marked "fill this in" is now filled
 * in by `lib/openfort.ts`, and the shape of `resolveVerifiedEmail` below is what stops
 * it from silently regressing — there is no longer a parameter to leak the body
 * through, so a future implementation cannot accidentally trust one.
 *
 * Two things this demo still does not do, and a production integration would:
 * check that the wallet in the body is one the authenticated user actually owns,
 * and rate-limit minting per session.
 *
 * Returning `null`/404 is a first-class outcome, not a failure — `fetchEmailAttestation`
 * treats it as "no attestation available" and the user verifies by OTP as usual.
 * Which is why every decline here is a quiet 404 rather than a 401 or a 500: an
 * unset signing key, an unset Openfort key, a missing or bad token, and a user
 * with no email linked all cost exactly one extra screen.
 */

import { attestationRequestSchema } from '@nightmarket/shared';
import { Hono } from 'hono';
import type { AttestationSigner } from '../lib/attestation';
import type { ResolveVerifiedEmail } from '../lib/openfort';

export interface AttestationRouteOptions {
  signer: AttestationSigner | null;
  /**
   * Resolve the verified email for an authenticated caller.
   *
   * Omitted → the route declines everything. There is deliberately no default:
   * the only implementation that needs no configuration is one that trusts the
   * client, and shipping that as a fallback is how the bug above got written.
   */
  resolveVerifiedEmail?: ResolveVerifiedEmail;
}

export function attestationRoutes({ signer, resolveVerifiedEmail }: AttestationRouteOptions) {
  const app = new Hono();

  app.post('/email', async (c) => {
    if (!signer) {
      console.log('[attest] declined: no signer — YODL_ATTESTATION_PRIVATE_KEY is unset');
      return c.json({ error: 'Attestation not configured' }, 404);
    }

    if (!resolveVerifiedEmail) {
      console.log(
        '[attest] declined: no caller authentication — OPENFORT_PUBLISHABLE_KEY is unset',
      );
      return c.json({ error: 'Attestation not configured' }, 404);
    }

    const parsed = attestationRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      console.log('[attest] declined: invalid request body —', parsed.error.message);
      return c.json({ error: 'Invalid request', detail: parsed.error.message }, 400);
    }

    const { walletAddress } = parsed.data;
    const verifiedEmail = await resolveVerifiedEmail(walletAddress, c.req.header('Authorization'));
    if (!verifiedEmail) {
      // We have nothing verified to assert. The user takes the OTP path.
      console.log(`[attest] declined: no verified email for ${walletAddress}`);
      return c.json({ error: 'No verified email for this wallet' }, 404);
    }

    const token = await signer.mint(walletAddress, verifiedEmail);
    // Minting is not acceptance. Yodl can still fall back to the OTP — the
    // integration not being cleared for attestation, the email already belonging
    // to another Yodl account (`email_taken`), a spent `jti`, an expired window.
    // Its own logs name the reason; ours only prove we produced a token.
    console.log(`[attest] minted for ${walletAddress} <${verifiedEmail}>`);
    return c.json({ token, email: verifiedEmail });
  });

  return app;
}

/** `GET /.well-known/jwks.json` — where Yodl fetches our public key. HTTPS in production. */
export function jwksRoute(signer: AttestationSigner | null) {
  const app = new Hono();
  app.get('/jwks.json', async (c) => {
    if (!signer) return c.json({ keys: [] });
    // Yodl caches the set and handles kid rotation; a short cache is plenty.
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(await signer.jwks());
  });
  return app;
}
