/**
 * Generate the Ed25519 keypair used for email attestation.
 *
 *   pnpm --filter @nightmarket/api keygen
 *
 * Prints the private key as a single-line PEM ready to paste into `.env`, and the
 * public JWK so you can eyeball the `kid` you are registering with Yodl. The
 * private key is only printed — writing it to a file here would put it a `git add
 * -A` away from a repository.
 */

import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';

const KID = process.argv[2] ?? `nightmarket-${new Date().toISOString().slice(0, 7)}`;

const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
  crv: 'Ed25519',
  extractable: true,
});

const pem = await exportPKCS8(privateKey);
const jwk = { ...(await exportJWK(publicKey)), kid: KID, alg: 'EdDSA', use: 'sig' };

console.log('\n# ── apps/api/.env ─────────────────────────────────────────────');
console.log(`YODL_ATTESTATION_KID=${KID}`);
// Base64, not an escaped PEM: Node's `--env-file` parser leaves `\n` as a
// literal backslash-n, so the escaped form imports as a corrupt key.
console.log(
  `YODL_ATTESTATION_PRIVATE_KEY=${Buffer.from(pem.trimEnd(), 'utf8').toString('base64')}`,
);
console.log('\n# ── public JWK (served at /.well-known/jwks.json) ─────────────');
console.log(JSON.stringify({ keys: [jwk] }, null, 2));
console.log(
  '\nRegister the HTTPS URL of that endpoint with Yodl. An http:// URL is treated\n' +
    'as no key material at all, and attestation stays off until Yodl enables it\n' +
    'for your integration.\n',
);
