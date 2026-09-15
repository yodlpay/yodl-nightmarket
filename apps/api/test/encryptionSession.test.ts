/**
 * `POST /v1/openfort/encryption-session` — the route that keeps Shield's
 * credentials off the device.
 *
 * Two facts are worth a test here and the rest is plumbing. The first: nothing is
 * minted for a caller Openfort does not vouch for, because a session minted for a
 * stranger is a stranger holding a decryption grant for somebody's wallet. The
 * second: the Shield secret and the encryption share go out on *our* request and
 * only the resulting session id comes back, so the app never sees either.
 *
 * Both servers are stubbed at `fetch`, which is also what lets the last case
 * assert the shape of the Shield call rather than just its outcome.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/env';
import { PaymentStore } from '../src/lib/store';

const INTEGRATION = '0x5f2f6f387f49f7cfe0f6f302ff7f6ba6748b6ff1';

const PUBLISHABLE_KEY = 'pk_test_fake0000000000000000000000';
const SHIELD_PUBLISHABLE_KEY = 'shield_pk_fake';
const SHIELD_SECRET_KEY = 'shield_sk_fake';
const ENCRYPTION_SHARE = 'c2hhcmUtc2hvd24tb25jZQ==';

const ACCESS_TOKEN = 'ofa_2f9b1c7d4e6a8b0c2d4e6f8a0b1c3d5e';
const USER_ID = 'usr_3f0a2e9c-6d51-4b0e-9d2a-0c1b7a5e4f11';
const SESSION_ID = 'enc_ses_7b1d93c4';

const GET_SESSION_URL = 'https://api.openfort.io/iam/v2/auth/get-session';
const SHIELD_URL = 'https://shield.openfort.io/project/encryption-session';

afterEach(() => vi.unstubAllGlobals());

const envWith = (shieldConfigured: boolean) =>
  loadEnv({
    NODE_ENV: 'test',
    YODL_INTEGRATION_ADDRESS: INTEGRATION,
    NIGHTMARKET_DATA_FILE: ':memory:',
    OPENFORT_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    ...(shieldConfigured
      ? {
          OPENFORT_SHIELD_PUBLISHABLE_KEY: SHIELD_PUBLISHABLE_KEY,
          OPENFORT_SHIELD_SECRET_KEY: SHIELD_SECRET_KEY,
          OPENFORT_SHIELD_ENCRYPTION_SHARE: ENCRYPTION_SHARE,
        }
      : {}),
  });

const appWith = (shieldConfigured = true) =>
  createApp({ env: envWith(shieldConfigured), store: new PaymentStore(':memory:') });

/** An Openfort that knows one token, and a Shield that mints one session. */
function stubOpenfort(options: { shieldStatus?: number } = {}) {
  const calls: { url: string; headers: Headers; body: string | null }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const headers = new Headers(init?.headers);
      calls.push({ url: href, headers, body: (init?.body as string | undefined) ?? null });

      if (href === GET_SESSION_URL) {
        if (headers.get('authorization') !== `Bearer ${ACCESS_TOKEN}`) {
          return Response.json({ error: 'unauthorized' }, { status: 401 });
        }
        return Response.json({
          session: { id: 'ses_9c4e1f2a', userId: USER_ID, token: ACCESS_TOKEN },
          user: { id: USER_ID, name: 'Night Shopper', email: null, emailVerified: false },
        });
      }

      if (href === SHIELD_URL) {
        if (options.shieldStatus) {
          return new Response('shield is unwell', { status: options.shieldStatus });
        }
        return Response.json({ session_id: SESSION_ID });
      }

      return Response.json({ error: 'unexpected request' }, { status: 404 });
    }),
  );

  return calls;
}

const mint = (app: ReturnType<typeof createApp>, token?: string) =>
  app.request('/v1/openfort/encryption-session', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

it('answers 501 when Shield is not configured', async () => {
  // The route exists, this server just isn't equipped for it — and it says so
  // before spending a round trip on a caller it could not serve anyway.
  const calls = stubOpenfort();
  const response = await mint(appWith(false), ACCESS_TOKEN);

  expect(response.status).toBe(501);
  expect(calls).toHaveLength(0);
});

describe('with Shield configured', () => {
  it('refuses a caller with no Openfort session', async () => {
    const calls = stubOpenfort();
    const response = await mint(appWith(), 'not-a-real-token');

    expect(response.status).toBe(401);
    // The load-bearing assertion: Shield was never asked, so no session exists
    // for a caller Openfort does not know.
    expect(calls.map((call) => call.url)).toEqual([GET_SESSION_URL]);
  });

  it('refuses a caller with no Authorization header at all', async () => {
    const calls = stubOpenfort();
    expect((await mint(appWith())).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('mints a session for an authenticated caller', async () => {
    const calls = stubOpenfort();
    const response = await mint(appWith(), ACCESS_TOKEN);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ session: SESSION_ID });

    const shield = calls.find((call) => call.url === SHIELD_URL);
    expect(shield?.headers.get('x-api-key')).toBe(SHIELD_PUBLISHABLE_KEY);
    expect(shield?.headers.get('x-api-secret')).toBe(SHIELD_SECRET_KEY);
    expect(JSON.parse(shield?.body ?? '{}')).toEqual({ encryption_part: ENCRYPTION_SHARE });
  });

  it('answers 502 when Shield declines', async () => {
    stubOpenfort({ shieldStatus: 500 });
    const response = await mint(appWith(), ACCESS_TOKEN);

    expect(response.status).toBe(502);
    // Whatever Shield said stays in our logs. The app is told only that the
    // upstream failed, which is all it can act on.
    expect(await response.json()).toEqual({ error: 'Could not mint an encryption session' });
  });
});
