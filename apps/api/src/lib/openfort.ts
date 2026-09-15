/**
 * Who is calling? — the Openfort session behind a request, and the email in it.
 *
 * This is the half of email attestation that is not cryptography. `lib/attestation.ts`
 * will sign whatever it is handed; the entire security of the feature is therefore
 * this file's answer to one question: *for the human holding this request, what
 * email has Openfort already verified?* The request body is not evidence, and
 * nothing here reads it.
 *
 * One hop, and it has to be a network hop. An Openfort v2 access token is an
 * opaque HMAC string rather than a JWT — no `iss`/`aud` to check, no key set to
 * cache, nothing a holder of the publishable key could verify offline. The token
 * is authenticated by handing it back to Openfort, and `get-session` answers with
 * the user it belongs to, `emailVerified` included. So the two facts a JWT design
 * splits across a signature check and a second, secret-authenticated user lookup
 * arrive together in one call that needs no secret at all. The price is a
 * dependency: no api.openfort.io, no attestation. That is a real trade, not an
 * oversight — failing closed is what makes it survivable.
 *
 * https://www.openfort.io/docs/products/embedded-wallet/react-native/
 *
 * Every resolution failure returns `null`, never a throw. A missing header, a
 * token that does not resolve, an Openfort outage, a sign-in that carries no
 * verified email — all the same outcome to the caller:
 * nothing we can honestly assert, so the user verifies by OTP exactly as if this
 * were never wired up.
 *
 * `shieldEncryptionSession` at the bottom is the deliberate exception. A wallet
 * whose recovery share cannot be decrypted has no quiet fallback to degrade into,
 * so it throws and its route answers 502 rather than pretending.
 */

import { z } from 'zod';

/** Where an opaque access token is exchanged for the user it belongs to. */
const GET_SESSION_URL = 'https://api.openfort.io/iam/v2/auth/get-session';

/** Shield, the service that holds the encrypted half of an automatic-recovery wallet. */
const ENCRYPTION_SESSION_URL = 'https://shield.openfort.io/project/encryption-session';

/**
 * Short. Yodl gives the whole attestation 30 seconds and this is the only hop
 * inside it; an Openfort that is thinking for longer than this has already lost
 * us the fast path, and waiting it out only delays the OTP the user is going to
 * take anyway.
 */
const FETCH_TIMEOUT_MS = 5_000;

/**
 * The slice of the session response we care about.
 *
 * Loose on purpose: Openfort adds fields to the user record without warning, and
 * a new one appearing must not turn into a decline for everybody. `emailVerified`
 * is `nullish` rather than required because an account type that cannot have an
 * email omits it entirely, and that is a decline, not a parse error.
 */
const getSessionSchema = z.looseObject({
  user: z.looseObject({
    id: z.string(),
    email: z.string().nullish(),
    emailVerified: z.boolean().nullish(),
  }),
});

/** What Shield hands back. Single-use; the SDK spends it on one recovery. */
const encryptionSessionSchema = z.looseObject({ session_id: z.string().min(1) });

/**
 * A caller Openfort vouches for.
 *
 * `email` is null unless Openfort reports both an address and `emailVerified`,
 * which keeps the two states this system cares about — "an email we may assert"
 * and "no such email" — one field rather than a pair that could disagree. An
 * unverified address is not a weaker yes; it is the same no as having none.
 */
export interface OpenfortSession {
  userId: string;
  email: string | null;
}

export type ResolveSession = (authorization: string | undefined) => Promise<OpenfortSession | null>;

export interface OpenfortSessionConfig {
  /** Public identifier, `pk_…`. The same value the app ships in its bundle. */
  publishableKey: string;
}

/**
 * Resolve the Openfort session an `Authorization` header belongs to.
 *
 * The primitive both routes are built on: attestation needs the email, the
 * encryption-session route needs only to know that somebody real is asking.
 */
export function openfortSession({ publishableKey }: OpenfortSessionConfig): ResolveSession {
  return async (authorization) => {
    const accessToken = bearer(authorization);
    if (!accessToken) {
      console.log('[openfort] no session: no bearer token on the request');
      return null;
    }

    let body: unknown;
    try {
      const response = await fetch(GET_SESSION_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-project-key': publishableKey,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Includes the ordinary case of an expired or revoked token: Openfort
        // answers 401 and there is nothing further to try.
        console.log(
          `[openfort] no session: Openfort returned ${response.status} for the access token`,
        );
        return null;
      }
      body = await response.json();
    } catch (cause) {
      console.log(`[openfort] no session: could not reach Openfort — ${reason(cause)}`);
      return null;
    }

    const parsed = getSessionSchema.safeParse(body);
    if (!parsed.success) {
      console.log(`[openfort] no session: unrecognised Openfort session — ${parsed.error.message}`);
      return null;
    }

    const { id, email, emailVerified } = parsed.data.user;
    // Openfort only sets `emailVerified` after its own code check, so it is the
    // fact we are relaying. Requiring it rather than assuming it is what keeps
    // this honest: an address we cannot see a verification for is one we decline
    // to vouch for.
    return { userId: id, email: emailVerified === true && email ? email : null };
  };
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

export function openfortSessionEmail(config: OpenfortSessionConfig): ResolveVerifiedEmail {
  const resolveSession = openfortSession(config);

  return async (walletAddress, authorization) => {
    const session = await resolveSession(authorization);
    if (!session) {
      console.log(`[attest] declined: no Openfort session for ${walletAddress}`);
      return null;
    }
    if (!session.email) {
      // Not a fault. A social or passkey sign-in need not carry a verified email.
      console.log(`[attest] declined: Openfort user ${session.userId} has no verified email`);
      return null;
    }
    return session.email;
  };
}

export interface ShieldConfig {
  /** Public identifier, and the same value the app passes as `shieldPublishableKey`. */
  shieldPublishableKey: string;
  /** Secret. Server-side only — it is what authorises minting sessions at all. */
  shieldSecretKey: string;
  /**
   * Our half of the recovery encryption. Shown once when the Shield keys are
   * created and never again, and it is the piece that makes the wallet
   * recoverable without asking the user for a password.
   */
  encryptionShare: string;
}

/** Mints a single-use Shield encryption session. */
export type MintEncryptionSession = () => Promise<string>;

/**
 * Mint a single-use Shield encryption session.
 *
 * Throws rather than returning `null`, unlike everything above: a caller that
 * cannot get a session cannot create or recover a wallet, so there is no
 * degraded mode to fall into and nothing to be gained by hiding the reason.
 */
export function shieldEncryptionSession(config: ShieldConfig): MintEncryptionSession {
  return async () => {
    const response = await fetch(ENCRYPTION_SESSION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.shieldPublishableKey,
        'x-api-secret': config.shieldSecretKey,
      },
      body: JSON.stringify({ encryption_part: config.encryptionShare }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Shield returned ${response.status}: ${await response.text()}`);
    }

    const parsed = encryptionSessionSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`Shield returned an unrecognised session — ${parsed.error.message}`);
    }
    return parsed.data.session_id;
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
