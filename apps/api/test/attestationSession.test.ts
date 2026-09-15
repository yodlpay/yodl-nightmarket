/**
 * Whose email gets signed — the route, end to end, against a stubbed Openfort.
 *
 * `attestation.test.ts` proves the token we mint is well formed. This file proves
 * the far more interesting thing: that the email inside it came from the caller's
 * session and could not have come from anywhere else. The route used to sign
 * whatever the body named, which meant any caller could assert any email for any
 * wallet and skip the OTP that exists to stop exactly that. The last case in
 * `declining` is the one that says it is closed — a request whose body names a
 * different address still mints for the session's.
 *
 * Openfort is stubbed at `fetch`, not mocked at the module boundary, because the
 * network hop *is* the design. A v2 access token is an opaque string; the only
 * thing that can say whose it is, and whether the email on it is verified, is
 * Openfort. Stubbing above `fetch` would let a rewrite that skips the call — or
 * one that trusts a token without sending the project key — keep passing.
 */

import { decodeJwt, exportPKCS8, generateKeyPair } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/env';
import { PaymentStore } from '../src/lib/store';

const INTEGRATION = '0x5f2f6f387f49f7cfe0f6f302ff7f6ba6748b6ff1';
const WALLET = '0x000000000000000000000000000000000000c0de';

const PUBLISHABLE_KEY = 'pk_test_fake0000000000000000000000';
const USER_ID = 'usr_3f0a2e9c-6d51-4b0e-9d2a-0c1b7a5e4f11';

/** The one token the stubbed Openfort recognises. Anything else gets a 401. */
const ACCESS_TOKEN = 'ofa_2f9b1c7d4e6a8b0c2d4e6f8a0b1c3d5e';

const GET_SESSION_URL = 'https://api.openfort.io/iam/v2/auth/get-session';

/** The email Openfort holds for the session. Everything below must mint this one. */
const SESSION_EMAIL = 'session@example.com';
/** What a hostile — or merely stale — client puts in the body. Never mintable. */
const CLAIMED_EMAIL = 'attacker@example.com';

let attestationKey: string;

beforeAll(async () => {
  const yodl = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  attestationKey = Buffer.from(await exportPKCS8(yodl.privateKey), 'utf8').toString('base64');
});

afterEach(() => vi.unstubAllGlobals());

const envWith = (openfortConfigured: boolean) =>
  loadEnv({
    NODE_ENV: 'test',
    YODL_INTEGRATION_ADDRESS: INTEGRATION,
    NIGHTMARKET_DATA_FILE: ':memory:',
    YODL_ATTESTATION_PRIVATE_KEY: attestationKey,
    ...(openfortConfigured ? { OPENFORT_PUBLISHABLE_KEY: PUBLISHABLE_KEY } : {}),
  });

/** The user record Openfort returns for a verified email sign-in. */
const verifiedUser = (email: string) => ({
  id: USER_ID,
  name: 'Night Shopper',
  email,
  emailVerified: true,
  createdAt: 1731974895,
  updatedAt: 1731974895,
});

/**
 * An Openfort that answers `get-session` for one token and 404s every other URL —
 * so a request to an endpoint this code should not be making fails loudly.
 */
function stubOpenfort(
  user: Record<string, unknown> = verifiedUser(SESSION_EMAIL),
  options: { status?: number; unreachable?: boolean } = {},
) {
  const calls: { url: string; headers: Headers }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const headers = new Headers(init?.headers);
      calls.push({ url: href, headers });

      if (options.unreachable) throw new TypeError('fetch failed');
      if (href !== GET_SESSION_URL) {
        return Response.json({ error: 'unexpected request' }, { status: 404 });
      }
      if (options.status) return Response.json({ error: 'nope' }, { status: options.status });
      // Openfort is the only thing that can tell a real token from a string, and
      // it says so with a 401 rather than by handing back an empty session.
      if (headers.get('authorization') !== `Bearer ${ACCESS_TOKEN}`) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }

      return Response.json({
        session: {
          id: 'ses_9c4e1f2a',
          userId: USER_ID,
          token: ACCESS_TOKEN,
          expiresAt: 1731978495,
          createdAt: 1731974895,
          updatedAt: 1731974895,
        },
        user,
      });
    }),
  );

  return calls;
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

const appWith = (openfortConfigured = true) =>
  createApp({ env: envWith(openfortConfigured), store: new PaymentStore(':memory:') });

/** The email the token actually asserts. Signature coverage lives in attestation.test.ts. */
const mintedEmail = async (response: Response) =>
  decodeJwt(((await response.json()) as { token: string }).token).email;

describe('declining', () => {
  it('declines when Openfort is not configured, even with a signer', async () => {
    // Fail closed: a signer with no way to authenticate the caller would sign for
    // anyone who asked, which is the bug this route used to have.
    const calls = stubOpenfort();
    const response = await attest(appWith(false), { token: ACCESS_TOKEN });
    expect(response.status).toBe(404);
    expect(await mintedEmailIsAbsent(response)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('declines a request with no Authorization header', async () => {
    const calls = stubOpenfort();
    expect((await attest(appWith())).status).toBe(404);
    // And Openfort is never asked: an unauthenticated request costs nothing.
    expect(calls).toHaveLength(0);
  });

  it('declines a token Openfort does not recognise', async () => {
    // The whole forgery surface, now that there is no signature to check locally:
    // a v2 access token is opaque, so "invalid" is whatever Openfort 401s.
    const calls = stubOpenfort();
    expect((await attest(appWith(), { token: 'not-a-real-token' })).status).toBe(404);
    expect(calls.map((call) => call.url)).toEqual([GET_SESSION_URL]);
  });

  it('declines a garbled Authorization header', async () => {
    const calls = stubOpenfort();
    const response = await appWith().request('/v1/attestations/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer' },
      body: JSON.stringify({ walletAddress: WALLET }),
    });
    expect(response.status).toBe(404);
    // Not even worth a round trip: nothing was parsed out of the header to send.
    expect(calls).toHaveLength(0);
  });

  it('declines when the session has no email', async () => {
    // Not a fault. A social or passkey sign-in need not carry an email at all, and
    // `null` is the outcome that produces the OTP path rather than an error.
    stubOpenfort({ id: USER_ID, name: 'Night Shopper', email: null, emailVerified: false });
    expect((await attest(appWith(), { token: ACCESS_TOKEN })).status).toBe(404);
  });

  it('declines an email Openfort has not verified', async () => {
    stubOpenfort({ id: USER_ID, name: 'Night Shopper', email: SESSION_EMAIL });
    expect((await attest(appWith(), { token: ACCESS_TOKEN })).status).toBe(404);
  });

  it('declines an email whose emailVerified is false', async () => {
    stubOpenfort({ ...verifiedUser(SESSION_EMAIL), emailVerified: false });
    expect((await attest(appWith(), { token: ACCESS_TOKEN })).status).toBe(404);
  });

  it('declines when Openfort itself is failing', async () => {
    stubOpenfort(verifiedUser(SESSION_EMAIL), { status: 503 });
    expect((await attest(appWith(), { token: ACCESS_TOKEN })).status).toBe(404);
  });

  it('declines when Openfort is unreachable', async () => {
    // The cost of losing the offline check: an outage at api.openfort.io is an
    // outage of the OTP skip. It must stay a decline, never a 500.
    stubOpenfort(verifiedUser(SESSION_EMAIL), { unreachable: true });
    expect((await attest(appWith(), { token: ACCESS_TOKEN })).status).toBe(404);
  });
});

describe('minting', () => {
  it('mints for the email on the caller session', async () => {
    const calls = stubOpenfort();
    const response = await attest(appWith(), { token: ACCESS_TOKEN });

    expect(response.status).toBe(200);
    expect(await response.clone().json()).toMatchObject({ email: SESSION_EMAIL });
    expect(await mintedEmail(response)).toBe(SESSION_EMAIL);

    // The token goes back as a bearer credential, and the project key names which
    // Openfort project is being asked. Openfort rejects the call without it.
    const lookup = calls.find((call) => call.url === GET_SESSION_URL);
    expect(lookup?.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(lookup?.headers.get('x-project-key')).toBe(PUBLISHABLE_KEY);
  });

  it('mints for the session email even when the body claims another', async () => {
    // The load-bearing case. This request is exactly the privilege escalation the
    // old route granted: a valid session, and a body naming somebody else's
    // address. It must produce a token for the session's email or none at all.
    const calls = stubOpenfort();
    const response = await attest(appWith(), {
      token: ACCESS_TOKEN,
      body: { email: CLAIMED_EMAIL },
    });

    expect(response.status).toBe(200);
    expect(await mintedEmail(response)).toBe(SESSION_EMAIL);
    // Nor did the claimed address leak outward as a lookup key.
    expect(JSON.stringify(calls)).not.toContain(CLAIMED_EMAIL);
  });

  it('accepts a body from a client that still sends an email', async () => {
    // `attestationRequestSchema` no longer names `email`, and Zod strips unknown
    // keys — so an older build of the app keeps working rather than 400ing.
    stubOpenfort();
    const response = await attest(appWith(), {
      token: ACCESS_TOKEN,
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
