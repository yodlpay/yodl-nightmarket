/**
 * Whose email gets signed — the route, end to end, against a stubbed Privy.
 *
 * `attestation.test.ts` proves the token we mint is well formed. This file proves
 * the far more interesting thing: that the email inside it came from the caller's
 * session and could not have come from anywhere else. The route used to sign
 * whatever the body named, which meant any caller could assert any email for any
 * wallet and skip the OTP that exists to stop exactly that. The last case here is
 * the one that says it is closed — a request whose body names a different address
 * still mints for the session's.
 *
 * Privy is stubbed at `fetch`, not mocked at the module boundary, because the two
 * network hops *are* the design: an offline JWKS verification of the access token,
 * then a user lookup with the app secret. Stubbing lower would let a rewrite that
 * skips the verification keep passing.
 */

import { decodeJwt, exportJWK, exportPKCS8, generateKeyPair, type JWK, SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/env';
import { PaymentStore } from '../src/lib/store';

const INTEGRATION = '0x5f2f6f387f49f7cfe0f6f302ff7f6ba6748b6ff1';
const WALLET = '0x000000000000000000000000000000000000c0de';

const APP_ID = 'clfake0000000000000000000';
const APP_SECRET = 'fake-privy-app-secret';
const USER_ID = 'did:privy:cm3np4u9j001rc8b73seqmqqk';

/** The email Privy holds for the session. Everything below must mint this one. */
const SESSION_EMAIL = 'session@example.com';
/** What a hostile — or merely stale — client puts in the body. Never mintable. */
const CLAIMED_EMAIL = 'attacker@example.com';

const JWKS_URL = `https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`;
const USER_URL = `https://api.privy.io/v1/users/${encodeURIComponent(USER_ID)}`;

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;
type SigningKey = KeyPair['privateKey'];

/** Privy's signing key, and one that is *not* Privy's, for the forgery case. */
let privy: KeyPair;
let impostor: KeyPair;
let publicJwk: JWK;
let attestationKey: string;

beforeAll(async () => {
  // ES256 because that is the only algorithm Privy signs access tokens with.
  privy = await generateKeyPair('ES256', { extractable: true });
  impostor = await generateKeyPair('ES256', { extractable: true });
  publicJwk = {
    ...(await exportJWK(privy.publicKey)),
    kid: 'privy-test',
    alg: 'ES256',
    use: 'sig',
  };

  const yodl = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  attestationKey = Buffer.from(await exportPKCS8(yodl.privateKey), 'utf8').toString('base64');
});

afterEach(() => vi.unstubAllGlobals());

const envWith = (privyConfigured: boolean) =>
  loadEnv({
    NODE_ENV: 'test',
    YODL_INTEGRATION_ADDRESS: INTEGRATION,
    NIGHTMARKET_DATA_FILE: ':memory:',
    YODL_ATTESTATION_PRIVATE_KEY: attestationKey,
    ...(privyConfigured ? { PRIVY_APP_ID: APP_ID, PRIVY_APP_SECRET: APP_SECRET } : {}),
  });

/**
 * A Privy that serves the key set and one user record, and 404s anything else —
 * so a request to an endpoint this code should not be making fails loudly.
 */
function stubPrivy(linkedAccounts: unknown[], options: { userStatus?: number } = {}) {
  const calls: { url: string; headers: Headers }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, headers: new Headers(init?.headers) });

      if (href === JWKS_URL) return Response.json({ keys: [publicJwk] });
      if (href === USER_URL) {
        if (options.userStatus && options.userStatus !== 200) {
          return Response.json({ error: 'nope' }, { status: options.userStatus });
        }
        return Response.json({
          id: USER_ID,
          created_at: 1731974895,
          linked_accounts: linkedAccounts,
          has_accepted_terms: true,
          is_guest: false,
        });
      }
      return Response.json({ error: 'unexpected request' }, { status: 404 });
    }),
  );

  return calls;
}

const emailAccount = (address: string) => ({
  type: 'email',
  address,
  first_verified_at: 1674788927,
  latest_verified_at: 1674788927,
  verified_at: 1674788927,
});

/** A Privy access token, with everything overridable so each failure mode is one line. */
async function accessToken(
  overrides: {
    key?: SigningKey;
    issuer?: string;
    audience?: string;
    subject?: string;
    expiresIn?: string;
  } = {},
) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: 'privy-test' })
    .setIssuer(overrides.issuer ?? 'privy.io')
    .setAudience(overrides.audience ?? APP_ID)
    .setSubject(overrides.subject ?? USER_ID)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '1h')
    .sign(overrides.key ?? privy.privateKey);
}

function attest(
  app: ReturnType<typeof createApp>,
  { token, body }: { token?: string; body?: Record<string, unknown> } = {},
) {
  return app.request('/v1/attestations/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ walletAddress: WALLET, ...body }),
  });
}

const appWith = (privyConfigured = true) =>
  createApp({ env: envWith(privyConfigured), store: new PaymentStore(':memory:') });

/** The email the token actually asserts. Signature coverage lives in attestation.test.ts. */
const mintedEmail = async (response: Response) =>
  decodeJwt(((await response.json()) as { token: string }).token).email;

describe('declining', () => {
  it('declines when Privy is not configured, even with a signer', async () => {
    // Fail closed: a signer with no way to authenticate the caller would sign for
    // anyone who asked, which is the bug this route used to have.
    stubPrivy([emailAccount(SESSION_EMAIL)]);
    const response = await attest(appWith(false), { token: await accessToken() });
    expect(response.status).toBe(404);
    expect(await mintedEmailIsAbsent(response)).toBe(true);
  });

  it('declines a request with no Authorization header', async () => {
    const calls = stubPrivy([emailAccount(SESSION_EMAIL)]);
    expect((await attest(appWith())).status).toBe(404);
    // And never reached for the key set: an unauthenticated request costs nothing.
    expect(calls).toHaveLength(0);
  });

  it('declines a token signed by someone who is not Privy', async () => {
    const calls = stubPrivy([emailAccount(SESSION_EMAIL)]);
    const forged = await accessToken({ key: impostor.privateKey });

    expect((await attest(appWith(), { token: forged })).status).toBe(404);
    // The JWKS was fetched and the signature failed against it; the user lookup
    // never happened, so an unverified `sub` can never name a record.
    expect(calls.map((call) => call.url)).toEqual([JWKS_URL]);
  });

  it('declines a token minted for a different Privy app', async () => {
    stubPrivy([emailAccount(SESSION_EMAIL)]);
    const token = await accessToken({ audience: 'some-other-app' });
    expect((await attest(appWith(), { token })).status).toBe(404);
  });

  it('declines a token from a different issuer', async () => {
    stubPrivy([emailAccount(SESSION_EMAIL)]);
    const token = await accessToken({ issuer: 'evil.example.com' });
    expect((await attest(appWith(), { token })).status).toBe(404);
  });

  it('declines an expired token', async () => {
    stubPrivy([emailAccount(SESSION_EMAIL)]);
    const token = await accessToken({ expiresIn: '-1h' });
    expect((await attest(appWith(), { token })).status).toBe(404);
  });

  it('declines a garbled Authorization header', async () => {
    stubPrivy([emailAccount(SESSION_EMAIL)]);
    expect((await attest(appWith(), { token: 'not-a-jwt' })).status).toBe(404);
  });

  it('declines when the session has no linked email', async () => {
    // Not a fault. SMS, passkey and OAuth sign-ins have nothing to attest, and
    // `null` is the outcome that produces the OTP path rather than an error.
    stubPrivy([{ type: 'phone', phoneNumber: '+15555550100', verified_at: 1674788927 }]);
    const response = await attest(appWith(), { token: await accessToken() });
    expect(response.status).toBe(404);
  });

  it('declines an email Privy has not verified', async () => {
    stubPrivy([{ type: 'email', address: SESSION_EMAIL }]);
    expect((await attest(appWith(), { token: await accessToken() })).status).toBe(404);
  });

  it('declines when Privy will not hand over the user', async () => {
    stubPrivy([emailAccount(SESSION_EMAIL)], { userStatus: 401 });
    expect((await attest(appWith(), { token: await accessToken() })).status).toBe(404);
  });
});

describe('minting', () => {
  it('mints for the email on file for the session', async () => {
    const calls = stubPrivy([emailAccount(SESSION_EMAIL)]);
    const response = await attest(appWith(), { token: await accessToken() });

    expect(response.status).toBe(200);
    expect(await response.clone().json()).toMatchObject({
      email: SESSION_EMAIL,
    });
    expect(await mintedEmail(response)).toBe(SESSION_EMAIL);

    // Read with the app secret over HTTP Basic, plus the app id header Privy
    // rejects the request without.
    const lookup = calls.find((call) => call.url === USER_URL);
    const basic = Buffer.from(`${APP_ID}:${APP_SECRET}`, 'utf8').toString('base64');
    expect(lookup?.headers.get('authorization')).toBe(`Basic ${basic}`);
    expect(lookup?.headers.get('privy-app-id')).toBe(APP_ID);
  });

  it('mints for the session email even when the body claims another', async () => {
    // The load-bearing case. This request is exactly the privilege escalation the
    // old route granted: a valid session, and a body naming somebody else's
    // address. It must produce a token for the session's email or none at all.
    const calls = stubPrivy([emailAccount(SESSION_EMAIL)]);
    const response = await attest(appWith(), {
      token: await accessToken(),
      body: { email: CLAIMED_EMAIL },
    });

    expect(response.status).toBe(200);
    expect(await mintedEmail(response)).toBe(SESSION_EMAIL);
    // Nor did the claimed address leak outward as a lookup key.
    expect(JSON.stringify(calls)).not.toContain(CLAIMED_EMAIL);
  });

  it('mints for the first verified email when several are linked', async () => {
    stubPrivy([
      { type: 'wallet', address: WALLET, verified_at: 1674788927 },
      emailAccount(SESSION_EMAIL),
      emailAccount('later@example.com'),
    ]);
    const response = await attest(appWith(), { token: await accessToken() });
    expect(await mintedEmail(response)).toBe(SESSION_EMAIL);
  });

  it('accepts a body from a client that still sends an email', async () => {
    // `attestationRequestSchema` no longer names `email`, and Zod strips unknown
    // keys — so an older build of the app keeps working rather than 400ing.
    stubPrivy([emailAccount(SESSION_EMAIL)]);
    const response = await attest(appWith(), {
      token: await accessToken(),
      body: { email: SESSION_EMAIL },
    });
    expect(response.status).toBe(200);
  });
});

/** A decline carries an error, never a token — worth asserting once. */
async function mintedEmailIsAbsent(response: Response) {
  const body = (await response.json()) as Record<string, unknown>;
  return !('token' in body);
}
