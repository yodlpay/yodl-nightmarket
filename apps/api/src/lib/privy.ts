/**
 * Who is calling? — resolving a verified email from a Privy session.
 *
 * This is the half of email attestation that is not cryptography. `lib/attestation.ts`
 * will sign whatever it is handed; the entire security of the feature is therefore
 * this file's answer to one question: *for the human holding this request, what
 * email has Privy already verified?* The request body is not evidence, and nothing
 * here reads it.
 *
 * Two round trips, because Privy splits the two facts:
 *
 *  1. **Who.** The `Authorization: Bearer …` header carries a Privy access token —
 *    an ES256 JWT with `iss: privy.io`, `aud` equal to our app id, and `sub` set to
 *    the user's Privy DID. It is verified offline against the JWKS Privy publishes
 *    for the app, so a forged or expired token never reaches step 2 and a valid one
 *    costs no network call after the key set is cached.
 *  2. **What.** The access token deliberately carries no email — its six claims are
 *    `sid`, `sub`, `iss`, `aud`, `iat`, `exp` and nothing else. So the email comes
 *    from the user record, read with the app secret over HTTP Basic. That is the
 *    only copy of the email this process will ever trust.
 *
 * https://docs.privy.io/authentication/user-authentication/access-tokens
 * https://docs.privy.io/api-reference/users/get
 *
 * Every failure returns `null`, never a throw. A missing header, a token that does
 * not verify, a Privy outage, a user who signed in by SMS and has no email at all —
 * they are all the same outcome to the caller: nothing we can honestly assert, so
 * the user verifies by OTP exactly as if this were never wired up. Failing closed is
 * cheap here, which is what makes it the right default.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

/** The token issuer, for every Privy app. */
const ISSUER = 'privy.io';

/** Privy signs access tokens with ES256 only. Pinned so `alg` is never negotiable. */
const ALGORITHMS = ['ES256'];

/** The public key set, per app. Not the same host as the user API. */
const jwksUrl = (appId: string) => new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);

/** The user API. `api.privy.io/api/v1/...` is a dead path — the live one has no `/api`. */
const userUrl = (userId: string) => `https://api.privy.io/v1/users/${encodeURIComponent(userId)}`;

/**
 * Short. Yodl gives the whole attestation 30 seconds and this is one of two hops
 * inside it; a Privy that is thinking for longer than this has already lost us the
 * fast path, and waiting it out only delays the OTP the user is going to take anyway.
 */
const USER_FETCH_TIMEOUT_MS = 5_000;

/**
 * The slice of the user record we care about.
 *
 * `.loose()` on purpose: Privy adds account types and fields without warning, and a
 * new one appearing must not turn into a decline for everybody.
 */
const privyUserSchema = z.looseObject({
  linked_accounts: z
    .array(
      z.looseObject({
        type: z.string(),
        address: z.string().optional(),
        verified_at: z.number().optional(),
      }),
    )
    .default([]),
});

export interface PrivySessionConfig {
  /** Public identifier. Doubles as the token `aud` and as the JWKS path segment. */
  appId: string;
  /** HTTP Basic password for api.privy.io. Server-side only. */
  appSecret: string;
}

/**
 * Resolve the verified email for the caller of an authenticated request.
 *
 * Takes the raw `Authorization` header and nothing else — deliberately. An earlier
 * shape also took the email the client claimed, and the only correct implementation
 * of that parameter was to ignore it, which is a comment where a type would do.
 */
export type ResolveVerifiedEmail = (
  walletAddress: string,
  authorization: string | undefined,
) => Promise<string | null>;

export function privySessionEmail(config: PrivySessionConfig): ResolveVerifiedEmail {
  // Built once, so the key set is fetched at most once per cooldown window rather
  // than per attestation.
  const jwks = createRemoteJWKSet(jwksUrl(config.appId));
  const basic = Buffer.from(`${config.appId}:${config.appSecret}`, 'utf8').toString('base64');

  return async (walletAddress, authorization) => {
    const accessToken = bearer(authorization);
    if (!accessToken) {
      console.log(`[attest] declined: no bearer token on the request for ${walletAddress}`);
      return null;
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(accessToken, jwks, {
        algorithms: ALGORITHMS,
        issuer: ISSUER,
        audience: config.appId,
      });
      if (!payload.sub) throw new Error('access token carries no sub');
      userId = payload.sub;
    } catch (cause) {
      console.log(`[attest] declined: access token did not verify — ${reason(cause)}`);
      return null;
    }

    let body: unknown;
    try {
      const response = await fetch(userUrl(userId), {
        headers: { Authorization: `Basic ${basic}`, 'privy-app-id': config.appId },
        signal: AbortSignal.timeout(USER_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        console.log(`[attest] declined: Privy returned ${response.status} for ${userId}`);
        return null;
      }
      body = await response.json();
    } catch (cause) {
      console.log(`[attest] declined: could not reach Privy for ${userId} — ${reason(cause)}`);
      return null;
    }

    const parsed = privyUserSchema.safeParse(body);
    if (!parsed.success) {
      console.log(`[attest] declined: unrecognised Privy user record — ${parsed.error.message}`);
      return null;
    }

    // Privy only ever links an email after its own code check, so `verified_at`
    // being present is the fact we are relaying. Requiring it rather than assuming
    // it is what keeps this honest if that ever stops being true: an account we
    // cannot see a verification date for is one we decline to vouch for.
    const email = parsed.data.linked_accounts.find(
      (account) => account.type === 'email' && account.address && account.verified_at !== undefined,
    )?.address;

    if (!email) {
      // Not a fault. SMS, passkey and OAuth sign-ins have no email to attest.
      console.log(`[attest] declined: Privy user ${userId} has no verified email linked`);
      return null;
    }

    return email;
  };
}

/** `Bearer <token>`, case-insensitively, or nothing. */
function bearer(authorization: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? '');
  return match?.[1] ?? null;
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
