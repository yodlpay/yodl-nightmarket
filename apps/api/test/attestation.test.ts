/**
 * Email attestation: the key encoding, and the claim set.
 *
 * The encoding half exists because of a real trap. A PKCS#8 PEM is multi-line and
 * `.env` parsers disagree about newlines — Node's `--env-file` keeps `\n` as a
 * literal backslash-n rather than unescaping it, so the obvious "escape the
 * newlines" encoding produces a key that fails to import with a complaint about
 * ASN.1 rather than about quoting. Base64 sidesteps the whole argument, and these
 * tests are what stop someone from helpfully "fixing" it back.
 *
 * The claim half checks the token the way Yodl says it checks it, against the
 * JWKS we actually publish.
 *
 * https://docs.yodl.me/integrations/email-attestation
 */

import {
  createLocalJWKSet,
  decodeProtectedHeader,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env';
import { AttestationSigner } from '../src/lib/attestation';

const INTEGRATION = '0x5f2f6f387f49f7cfe0f6f302ff7f6ba6748b6ff1';
const WALLET = '0x000000000000000000000000000000000000c0de';
const EMAIL = 'user@example.com';

let pem: string;
let base64Pem: string;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  pem = (await exportPKCS8(privateKey)).trimEnd();
  base64Pem = Buffer.from(pem, 'utf8').toString('base64');
});

const envWith = (key: string | undefined) =>
  loadEnv({
    NODE_ENV: 'test',
    YODL_INTEGRATION_ADDRESS: INTEGRATION,
    NIGHTMARKET_DATA_FILE: ':memory:',
    ...(key === undefined ? {} : { YODL_ATTESTATION_PRIVATE_KEY: key }),
  });

describe('private key encoding', () => {
  it('decodes a base64-encoded PEM', () => {
    expect(envWith(base64Pem).YODL_ATTESTATION_PRIVATE_KEY).toBe(pem);
  });

  it('passes a raw PEM through untouched', () => {
    // A secret store that hands over the PEM intact should just work.
    expect(envWith(pem).YODL_ATTESTATION_PRIVATE_KEY).toBe(pem);
  });

  it('rejects a PEM whose newlines were escaped rather than encoded', () => {
    // The exact mistake: `KEY="-----BEGIN...\n..."` in a .env, which Node hands
    // over with literal backslash-n. It still contains "-----BEGIN", so it takes
    // the raw-PEM branch — and would reach `importPKCS8` as a corrupt key.
    const escaped = pem.replace(/\n/g, '\\n');
    expect(escaped).toContain('-----BEGIN');
    expect(() => envWith(escaped)).not.toThrow();
    // …which is why the signer, not the parser, is the backstop here:
    const signer = new AttestationSigner({
      privateKeyPem: escaped,
      kid: 'k',
      integrationAddress: INTEGRATION,
    });
    return expect(signer.mint(WALLET, EMAIL)).rejects.toThrow();
  });

  it('rejects a value that is neither', () => {
    expect(() => envWith('not-a-key')).toThrow(/PKCS#8 PEM/);
  });

  it('leaves the signer off when unset', () => {
    expect(envWith(undefined).YODL_ATTESTATION_PRIVATE_KEY).toBeUndefined();
  });
});

describe('minted token', () => {
  const kid = 'nightmarket-test';

  const sign = async () => {
    const signer = new AttestationSigner({
      privateKeyPem: envWith(base64Pem).YODL_ATTESTATION_PRIVATE_KEY!,
      kid,
      integrationAddress: INTEGRATION,
    });
    return { signer, token: await signer.mint(WALLET, EMAIL) };
  };

  it('verifies against the JWKS we publish', async () => {
    const { signer, token } = await sign();
    const jwks = await signer.jwks();

    const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
      // The allowlist Yodl applies before anything else, so `alg: none` and
      // friends never reach a key lookup.
      algorithms: ['EdDSA', 'ES256'],
      issuer: INTEGRATION,
      audience: 'api.yodl.me',
    });

    // `sub` is the wallet, not the email — the binding is what makes the token
    // un-replayable against a different wallet.
    expect(payload.sub).toBe(WALLET);
    expect(payload.email).toBe(EMAIL);
    expect(payload.email_verified).toBe(true);
    expect(decodeProtectedHeader(token).kid).toBe(kid);
    expect(jwks.keys[0]?.kid).toBe(kid);
  });

  it('lives at most 5 minutes, starting now', async () => {
    const { token } = await sign();
    const { payload } = await jwtVerify(
      token,
      createLocalJWKSet(await (await sign()).signer.jwks()),
      {
        algorithms: ['EdDSA'],
        issuer: INTEGRATION,
        audience: 'api.yodl.me',
      },
    ).catch(async () => {
      // Two `sign()` calls produce two signers over the same key, so either
      // JWKS verifies either token; this catch only exists to keep the test
      // honest if that ever stops being true.
      throw new Error('token did not verify against a signer sharing its key');
    });

    const lifetime = (payload.exp ?? 0) - (payload.iat ?? 0);
    expect(lifetime).toBeGreaterThan(0);
    expect(lifetime).toBeLessThanOrEqual(300);
    // `iat` must not be in the future: the cap constrains the window's width,
    // not where it sits.
    expect(payload.iat ?? 0).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 30);
  });

  it('mints a fresh jti every time', async () => {
    // Single use, scoped to the integration. Yodl records it on first successful
    // use and rejects the second, so a cached token burns itself.
    const [a, b] = await Promise.all([sign(), sign()]);
    const claims = (token: string) =>
      JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());

    expect(claims(a.token).jti).not.toBe(claims(b.token).jti);
  });
});
