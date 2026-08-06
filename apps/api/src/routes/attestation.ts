/**
 * `POST /v1/attestations/email` and the JWKS document that lets Yodl verify it.
 *
 * https://docs.yodl.me/integrations/email-attestation
 *
 * ── What this demo does not do ────────────────────────────────────────────────
 *
 * A real implementation authenticates the caller — a session token, a Privy
 * access token, something — and then signs for the email *it* has on file for
 * that user. It never signs for an email the client sent it.
 *
 * This route takes the email from the request body and signs it, which is fine
 * for a demo and is a privilege-escalation bug in production: any caller could
 * assert any email for any wallet, and the OTP step that exists to prevent
 * exactly that would be skipped. The `requireAuth` hook below marks the seam.
 * Fill it in before this goes anywhere real.
 *
 * Returning `null`/404 is a first-class outcome, not a failure — `fetchEmailAttestation`
 * treats it as "no attestation available" and the user verifies by OTP as usual.
 * Which is why an unconfigured signer here returns a quiet 404 rather than a 500.
 */

import { attestationRequestSchema } from '@nightmarket/shared';
import { Hono } from 'hono';
import type { AttestationSigner } from '../lib/attestation';

export interface AttestationRouteOptions {
  signer: AttestationSigner | null;
  /**
   * Resolve the verified email for an authenticated caller.
   *
   * Return `null` to decline. The demo implementation trusts the request body;
   * swap it for one that reads your session and ignores the body entirely.
   */
  resolveVerifiedEmail?: (
    walletAddress: string,
    claimedEmail: string | undefined,
    authorization: string | undefined,
  ) => Promise<string | null>;
}

export function attestationRoutes({ signer, resolveVerifiedEmail }: AttestationRouteOptions) {
  const app = new Hono();
  const resolve = resolveVerifiedEmail ?? demoResolveVerifiedEmail;

  app.post('/email', async (c) => {
    if (!signer) {
      console.log('[attest] declined: no signer — YODL_ATTESTATION_PRIVATE_KEY is unset');
      return c.json({ error: 'Attestation not configured' }, 404);
    }

    const parsed = attestationRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      console.log('[attest] declined: invalid request body —', parsed.error.message);
      return c.json({ error: 'Invalid request', detail: parsed.error.message }, 400);
    }

    const { walletAddress, email } = parsed.data;
    const verifiedEmail = await resolve(walletAddress, email, c.req.header('Authorization'));
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

/**
 * The demo stand-in. Asserts whatever it is handed.
 *
 * Deliberately a named function rather than an inline default so it shows up in
 * a stack trace and in a grep for "demo" — this is the line to delete.
 */
async function demoResolveVerifiedEmail(
  _walletAddress: string,
  claimedEmail: string | undefined,
): Promise<string | null> {
  return claimedEmail ?? null;
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
