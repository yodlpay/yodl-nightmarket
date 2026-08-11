/**
 * The donor-side KYC routes, against a faked Sumsub.
 *
 * Two things matter enough to pin down here. The request signature — Sumsub's
 * HMAC covers `ts + METHOD + pathWithQuery + body`, byte-for-byte, and a signer
 * that drifts (stringified Buffer, re-serialized JSON) fails with a 401 that
 * looks exactly like wrong credentials. And the state gate — a share token must
 * only ever be minted for an approved applicant, because the token *is* the
 * verified identity as far as the recipient is concerned.
 */

import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/env';
import { PaymentStore } from '../src/lib/store';

const WALLET = '0x000000000000000000000000000000000000c0de';
const EXTERNAL_USER_ID = `nightmarket-${WALLET}`;
const APPLICANT_ID = 'sumsub-applicant-1';
const APP_TOKEN = 'sbx:test-token';
const SECRET = 'test-sumsub-secret';

const env = loadEnv({
  NODE_ENV: 'test',
  NIGHTMARKET_DATA_FILE: ':memory:',
  SUMSUB_APP_TOKEN: APP_TOKEN,
  SUMSUB_SECRET_KEY: SECRET,
  SUMSUB_LEVEL_NAME: 'id-and-liveness',
  SUMSUB_SHARE_FOR_CLIENT_ID: 'yodlpay.com',
});

const unconfiguredEnv = loadEnv({ NODE_ENV: 'test', NIGHTMARKET_DATA_FILE: ':memory:' });

type FetchCall = { method: string; path: string; body: Buffer | null; headers: Headers };

let calls: FetchCall[];
let responder: (call: FetchCall) => { status: number; json: unknown };

/** A Sumsub that answers what the responder says and records exactly what it was sent. */
function fakeSumsub() {
  calls = [];
  responder = () => ({ status: 404, json: { description: 'Applicant not found' } });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = new URL(String(input));
      const body =
        init?.body === undefined
          ? null
          : Buffer.isBuffer(init.body)
            ? init.body
            : Buffer.from(init.body as string);
      const call: FetchCall = {
        body,
        headers: new Headers(init?.headers),
        method: init?.method ?? 'GET',
        path: url.pathname + url.search,
      };
      calls.push(call);
      const { status, json } = responder(call);
      return new Response(JSON.stringify(json), {
        headers: { 'Content-Type': 'application/json' },
        status,
      });
    }),
  );
}

const approvedApplicant = {
  id: APPLICANT_ID,
  externalUserId: EXTERNAL_USER_ID,
  review: { reviewResult: { reviewAnswer: 'GREEN' }, reviewStatus: 'completed' },
};

function buildApp(appEnv = env) {
  return createApp({ env: appEnv, store: new PaymentStore(':memory:') });
}

beforeEach(fakeSumsub);
afterEach(() => vi.unstubAllGlobals());

describe('capability gating', () => {
  it('answers 501 on every KYC route when Sumsub is unconfigured', async () => {
    const app = buildApp(unconfiguredEnv);
    for (const [method, path] of [
      ['GET', `/v1/kyc/${WALLET}`],
      ['POST', `/v1/kyc/${WALLET}/simulate`],
      ['POST', `/v1/kyc/${WALLET}/share-token`],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(501);
    }
    expect(calls).toHaveLength(0);
  });

  it('reports the capability on /health', async () => {
    type Health = { capabilities: { kyc: boolean } };

    const configured = (await (await buildApp().request('/health')).json()) as Health;
    expect(configured.capabilities.kyc).toBe(true);

    const unconfigured = (await (
      await buildApp(unconfiguredEnv).request('/health')
    ).json()) as Health;
    expect(unconfigured.capabilities.kyc).toBe(false);
  });

  it('rejects a production Sumsub token at env load', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'test',
        NIGHTMARKET_DATA_FILE: ':memory:',
        SUMSUB_APP_TOKEN: 'prd:definitely-not',
        SUMSUB_SECRET_KEY: 'x',
      }),
    ).toThrow(/sandbox token/);
  });

  it('rejects a wallet that is not an address', async () => {
    const res = await buildApp().request('/v1/kyc/not-a-wallet');
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('GET /v1/kyc/:wallet', () => {
  it('reports none for a wallet Sumsub has never seen', async () => {
    const res = await buildApp().request(`/v1/kyc/${WALLET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      applicantId: null,
      reviewAnswer: null,
      reviewStatus: 'none',
    });
  });

  it('maps an approved applicant and asks by externalUserId', async () => {
    responder = () => ({ json: approvedApplicant, status: 200 });

    const res = await buildApp().request(`/v1/kyc/${WALLET}`);
    expect(await res.json()).toEqual({
      applicantId: APPLICANT_ID,
      reviewAnswer: 'GREEN',
      reviewStatus: 'completed',
    });
    expect(calls[0]?.path).toBe(
      `/resources/applicants/-;externalUserId=${encodeURIComponent(EXTERNAL_USER_ID)}/one`,
    );
  });

  it('signs requests over ts + method + path + body with the app secret', async () => {
    responder = () => ({ json: approvedApplicant, status: 200 });
    await buildApp().request(`/v1/kyc/${WALLET}`);

    const call = calls[0];
    expect(call?.headers.get('x-app-token')).toBe(APP_TOKEN);
    const ts = call?.headers.get('x-app-access-ts');
    const expected = createHmac('sha256', SECRET).update(`${ts}GET${call?.path}`).digest('hex');
    expect(call?.headers.get('x-app-access-sig')).toBe(expected);
  });
});

describe('POST /v1/kyc/:wallet/share-token', () => {
  it('refuses to mint for an unapproved wallet', async () => {
    responder = () => ({
      json: { ...approvedApplicant, review: { reviewStatus: 'pending', reviewResult: {} } },
      status: 200,
    });

    const res = await buildApp().request(`/v1/kyc/${WALLET}/share-token`, { method: 'POST' });
    expect(res.status).toBe(409);
    expect(calls.map((c) => c.path)).not.toContainEqual(
      expect.stringContaining('/accessTokens/shareToken'),
    );
  });

  it('mints a share token for the configured recipient, signing the JSON body', async () => {
    responder = (call) =>
      call.path.includes('/accessTokens/shareToken')
        ? { json: { forClientId: 'yodlpay.com', token: '_act-sbx-share' }, status: 200 }
        : { json: approvedApplicant, status: 200 };

    const res = await buildApp().request(`/v1/kyc/${WALLET}/share-token`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ forClientId: 'yodlpay.com', shareToken: '_act-sbx-share' });

    const mint = calls.find((c) => c.path.includes('/accessTokens/shareToken'));
    expect(mint?.method).toBe('POST');
    expect(JSON.parse(String(mint?.body))).toEqual({
      applicantId: APPLICANT_ID,
      forClientId: 'yodlpay.com',
      ttlInSecs: 600,
    });

    // The signature must cover the exact body bytes that went on the wire.
    const ts = mint?.headers.get('x-app-access-ts');
    const expected = createHmac('sha256', SECRET)
      .update(`${ts}POST${mint?.path}`)
      .update(mint?.body ?? Buffer.alloc(0))
      .digest('hex');
    expect(mint?.headers.get('x-app-access-sig')).toBe(expected);
  });

  it('surfaces Sumsub failures as 502 with the description', async () => {
    responder = (call) =>
      call.path.includes('/accessTokens/shareToken')
        ? { json: { description: 'Sharing is not enabled for this client' }, status: 400 }
        : { json: approvedApplicant, status: 200 };

    const res = await buildApp().request(`/v1/kyc/${WALLET}/share-token`, { method: 'POST' });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toContain('Sharing is not enabled');
  });
});

describe('POST /v1/kyc/:wallet/simulate', () => {
  it('creates, documents, submits, and simulates a GREEN review for a new wallet', async () => {
    let approved = false;
    responder = (call) => {
      if (call.path.startsWith('/resources/applicants/-;externalUserId=')) {
        return approved
          ? { json: approvedApplicant, status: 200 }
          : { json: { description: 'not found' }, status: 404 };
      }
      if (call.path.startsWith('/resources/applicants?levelName=')) {
        return { json: { id: APPLICANT_ID }, status: 201 };
      }
      if (call.path.endsWith('/status/testCompleted')) {
        approved = true;
        return { json: { ok: 1 }, status: 200 };
      }
      return { json: { ok: 1 }, status: 200 };
    };

    const res = await buildApp().request(`/v1/kyc/${WALLET}/simulate`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      applicantId: APPLICANT_ID,
      reviewAnswer: 'GREEN',
      reviewStatus: 'completed',
    });

    const paths = calls.map((c) => c.path);
    expect(paths).toContainEqual(expect.stringContaining('/info/idDoc'));
    expect(paths).toContainEqual(expect.stringContaining('/status/pending'));
    expect(paths).toContainEqual(expect.stringContaining('/status/testCompleted'));
  });

  it('short-circuits an already-approved wallet without touching Sumsub again', async () => {
    responder = () => ({ json: approvedApplicant, status: 200 });

    const res = await buildApp().request(`/v1/kyc/${WALLET}/simulate`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1); // one status lookup, nothing else
  });
});
