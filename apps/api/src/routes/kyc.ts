/**
 * The donor-side KYC routes for Yodl's Reusable KYC.
 *
 * Three verbs, one story:
 *
 *   `GET  /v1/kyc/:wallet`             — where this wallet stands with our tenant
 *   `POST /v1/kyc/:wallet/simulate`    — sandbox stand-in for a real KYC flow
 *   `POST /v1/kyc/:wallet/share-token` — the hand-off the Yodl SDK asks for
 *
 * The share token is the only piece Yodl ever sees. The SDK requests it through
 * the host app (that's us), passes it to Yodl's backend, and Sumsub copies the
 * verification tenant-to-tenant — no PII transits Nightmarket's or Yodl's
 * servers on the way.
 *
 * There is no session auth here, deliberately: the rest of this demo API trusts
 * the wallet address the app supplies, and these routes follow suit. A real host
 * wallet must key this off its session instead, because a share token lets
 * whoever redeems it *become this KYC'd person* at the recipient. That is a
 * bigger prize than a payment feed.
 */

import { type Context, Hono } from 'hono';
import { isAddress } from 'viem';
import { SumsubApiError, type SumsubKycClient } from '../lib/sumsub';

/** externalUserId in *our* Sumsub tenant. Prefixed so demo applicants are unmistakable. */
const externalUserId = (wallet: string) => `nightmarket-${wallet.toLowerCase()}`;

export function kycRoutes(sumsub: SumsubKycClient | null) {
  const app = new Hono();

  /**
   * Absent config disables the capability rather than half-working — the same
   * contract as the attestation signer. 501 rather than 404: the route exists,
   * the server just isn't equipped for it, and the app renders that as
   * "KYC unavailable" instead of retrying.
   */
  const requireClient = (c: Context): SumsubKycClient | Response => {
    if (!sumsub) return c.json({ error: 'KYC is not configured' }, 501);
    return sumsub;
  };

  const requireWallet = (c: Context): string | Response => {
    const wallet = c.req.param('wallet');
    if (!wallet || !isAddress(wallet, { strict: false })) {
      return c.json({ error: 'Invalid wallet address' }, 400);
    }
    return wallet;
  };

  app.get('/:wallet', async (c) => {
    const kyc = requireClient(c);
    if (kyc instanceof Response) return kyc;
    const wallet = requireWallet(c);
    if (wallet instanceof Response) return wallet;

    return c.json(await kyc.getStatus(externalUserId(wallet)));
  });

  /**
   * Make this wallet an approved donor, sandbox-style: applicant + sample
   * documents + simulated GREEN review. A production wallet gets here by its
   * users actually completing verification; a demo gets here by button.
   *
   * Two sandbox quirks worth knowing. The automated recheck eventually flips
   * the fake selfie to RED (BAD_SELFIE) — calling simulate again re-asserts
   * GREEN, so mint the share token promptly after simulating. And a donor
   * whose history includes that RED may be refused at redemption with
   * Sumsub's misleading "Reusable KYC is not supported for level" — a fresh
   * wallet (fresh applicant) redeems cleanly every time.
   */
  app.post('/:wallet/simulate', async (c) => {
    const kyc = requireClient(c);
    if (kyc instanceof Response) return kyc;
    const wallet = requireWallet(c);
    if (wallet instanceof Response) return wallet;

    try {
      const status = await kyc.approveForDemo(externalUserId(wallet));
      console.log(`[kyc] simulated approval for ${wallet}: ${status.reviewAnswer}`);
      return c.json(status);
    } catch (error) {
      return sumsubFailure(c, error, 'KYC simulation failed');
    }
  });

  /**
   * Mint the single-use share token the Yodl SDK's KYC callback resolves with.
   * Only an approved applicant can donate — Sumsub enforces this too, but
   * answering 409 here keeps the failure legible to the app.
   */
  app.post('/:wallet/share-token', async (c) => {
    const kyc = requireClient(c);
    if (kyc instanceof Response) return kyc;
    const wallet = requireWallet(c);
    if (wallet instanceof Response) return wallet;

    const status = await kyc.getStatus(externalUserId(wallet));
    if (status.reviewAnswer !== 'GREEN' || !status.applicantId) {
      return c.json(
        {
          error: 'KYC is not approved for this wallet',
          reviewAnswer: status.reviewAnswer,
          reviewStatus: status.reviewStatus,
        },
        409,
      );
    }

    try {
      const { token, forClientId } = await kyc.createShareToken(status.applicantId);
      console.log(`[kyc] share token minted for ${wallet} -> ${forClientId}`);
      return c.json({ forClientId, shareToken: token });
    } catch (error) {
      return sumsubFailure(c, error, 'Share token minting failed');
    }
  });

  return app;
}

/** Sumsub's own description is the useful part; pass it through with our framing. */
function sumsubFailure(c: Context, error: unknown, framing: string) {
  if (error instanceof SumsubApiError) {
    console.error(`[kyc] ${framing}: ${error.status} ${error.message}`);
    return c.json({ error: framing, detail: error.message }, 502);
  }
  throw error;
}
