/**
 * Email attestation — minting the JWT that lets a user skip Yodl's email OTP.
 *
 * https://docs.yodl.me/integrations/email-attestation
 *
 * The token asserts one thing: *this wallet belongs to this email, and we have
 * already verified the email ourselves*. Yodl fetches our public key from the
 * JWKS URL we register, verifies, and registers the user with the email
 * pre-verified.
 *
 * Three constraints the doc is emphatic about, encoded below:
 *
 *  - **`sub` is the wallet, not the email.** That is what makes the token a
 *    binding rather than two loose attributes — a token minted for one wallet
 *    cannot be replayed against another. Yodl checks `sub` against the wallet the
 *    caller already proved control of via SIWE.
 *  - **`exp - iat` ≤ 300s, and `iat` may not be in the future.** The cap
 *    constrains the window's width; the `iat` rule constrains where it sits. A
 *    five-minute window placed a week out would otherwise verify today and keep
 *    its OTP-bypass authority until then. Two minutes is comfortable.
 *  - **`jti` is single use.** Minted fresh per call, from real entropy, never
 *    derived from the user or the email. Yodl records it on first successful use
 *    and rejects the second.
 *
 * Failures on Yodl's side are all *fallbacks*, never errors: an expired token, an
 * unknown `kid`, a spent `jti` or an email already bound elsewhere all send the
 * user through the normal OTP. So this route being down degrades the experience
 * by one screen; it never blocks signup.
 *
 * Note also that attestation is granted per integration and is **off by default**.
 * Until Yodl enables it, a perfectly valid token here changes nothing.
 */

import { createPublicKey, randomUUID } from 'node:crypto';
import { exportJWK, importPKCS8, type JWK, SignJWT } from 'jose';

/** The only two algorithms Yodl will accept. The allowlist is applied before anything else. */
const ALG = 'EdDSA';

/** Yodl's fixed audience. */
const AUDIENCE = 'api.yodl.me';

/** Well under the 5-minute cap, with room for a slow round trip on mobile data. */
const LIFETIME_SECONDS = 120;

export interface AttestationSignerConfig {
  /** Ed25519 private key, PKCS#8 PEM. Generate with `pnpm --filter @nightmarket/api keygen`. */
  privateKeyPem: string;
  /** Must match a key in the published JWKS. */
  kid: string;
  /** Our integration address — it doubles as `iss`. */
  integrationAddress: string;
}

export class AttestationSigner {
  #config: AttestationSignerConfig;
  #privateKey?: Awaited<ReturnType<typeof importPKCS8>>;
  #publicJwk?: JWK;

  constructor(config: AttestationSignerConfig) {
    this.#config = config;
  }

  /**
   * Mint a token for a wallet whose email *we* have already verified.
   *
   * The caller is responsible for that last part. This function will happily sign
   * whatever it is given — the authentication of the user, and the check that the
   * email really is theirs, belongs in the route above it. Signing is the easy
   * half; knowing what you are entitled to assert is the whole thing.
   */
  async mint(walletAddress: string, email: string): Promise<string> {
    const key = await this.#key();
    const issuedAt = Math.floor(Date.now() / 1000);

    return new SignJWT({ email, email_verified: true })
      .setProtectedHeader({ alg: ALG, kid: this.#config.kid })
      .setIssuer(this.#config.integrationAddress)
      .setAudience(AUDIENCE)
      .setSubject(walletAddress)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + LIFETIME_SECONDS)
      .setJti(randomUUID())
      .sign(key);
  }

  /**
   * The public half, as a JWKS document.
   *
   * Served over HTTPS in production — an `http://` JWKS URL is treated by Yodl as
   * no key material at all. Keep rotated-out keys in the set until every token
   * signed with them has expired; Yodl caches the set and handles `kid` rotation,
   * so publishing a new key needs no coordination.
   */
  async jwks(): Promise<{ keys: JWK[] }> {
    if (!this.#publicJwk) {
      const publicKey = createPublicKey(this.#config.privateKeyPem);
      this.#publicJwk = {
        ...(await exportJWK(publicKey)),
        kid: this.#config.kid,
        alg: ALG,
        use: 'sig',
      };
    }
    return { keys: [this.#publicJwk] };
  }

  async #key() {
    this.#privateKey ??= await importPKCS8(this.#config.privateKeyPem, ALG);
    return this.#privateKey;
  }
}
