/**
 * Environment, read once and validated once.
 *
 * The two Yodl secrets are deliberately separate fields with separate names.
 * They are not interchangeable and mixing them up produces a confusing failure:
 *
 *  - `YODL_WEBHOOK_SIGNING_SECRET` is an HMAC key. It is never transmitted —
 *    nothing in a delivery contains it — and it only ever proves that a webhook
 *    came from Yodl.
 *  - `YODL_API_SECRET` is an HTTP Basic password that travels on every request to
 *    api.yodl.me. Anything holding it can read every payment made through the
 *    integration, so it stays server-side.
 *
 * https://docs.yodl.me/integrations/overview
 */

import { isAddress, zeroAddress } from 'viem';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Lowercased on read: Yodl lowercases it in the payload and the header. */
  YODL_INTEGRATION_ADDRESS: z
    .string()
    // `strict: false` accepts either casing — an operator pasting the checksummed
    // form from Yodl's dashboard is pasting the right address, and the transform
    // below is what settles which form we hold.
    .refine(
      (value) => isAddress(value, { strict: false }),
      'YODL_INTEGRATION_ADDRESS must be a 0x address',
    )
    .transform((value) => value.toLowerCase())
    .default(zeroAddress),

  /** HMAC key for `X-Yodl-Signature`. Defaults to the doc's worked-example secret. */
  YODL_WEBHOOK_SIGNING_SECRET: z.string().min(1).default('integration-example-secret'),

  /** HTTP Basic password for api.yodl.me. Absent → the proxy route returns 501. */
  YODL_API_SECRET: z.string().optional(),
  YODL_API_BASE_URL: z.string().url().default('https://api.yodl.me'),

  /**
   * Ed25519 private key for email attestation, base64-encoded PKCS#8 PEM.
   * Absent → the attestation route is off and returns 404.
   *
   * Base64 because a PEM is multi-line and `.env` files disagree about newlines:
   * Node's `--env-file` parser keeps `\n` as a literal backslash-n rather than
   * unescaping it, so the obvious "escape the newlines" encoding yields a key
   * that fails to import with a message about ASN.1 rather than about quoting.
   * One line of base64 has no such ambiguity in any parser.
   *
   * A raw PEM is still accepted, for a deployment whose secret store hands one
   * over intact.
   */
  YODL_ATTESTATION_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      if (value.includes('-----BEGIN')) return value;
      return Buffer.from(value, 'base64').toString('utf8');
    })
    .refine((value) => value === undefined || value.includes('-----BEGIN PRIVATE KEY-----'), {
      message:
        'YODL_ATTESTATION_PRIVATE_KEY must be a PKCS#8 PEM, or that PEM base64-encoded. ' +
        'Regenerate with: pnpm --filter @nightmarket/api keygen',
    }),
  YODL_ATTESTATION_KID: z.string().default('nightmarket-dev'),

  /**
   * Sumsub sandbox credentials for the Reusable-KYC donor role: Nightmarket's
   * users KYC against *our* Sumsub tenant, and `/v1/kyc/:wallet/share-token`
   * mints the token that lets Yodl's tenant copy that verification instead of
   * re-verifying. Absent → the /v1/kyc routes answer 501.
   *
   * Sandbox tokens only (`sbx:`), enforced. Two things here belong nowhere near
   * a production tenant: the simulate route fabricates approvals, and a demo
   * backend has no business holding keys that can mint share tokens for real
   * identities.
   */
  SUMSUB_APP_TOKEN: z
    .string()
    .startsWith('sbx:', 'SUMSUB_APP_TOKEN must be a sandbox token (sbx:...)')
    .optional(),
  SUMSUB_SECRET_KEY: z.string().min(1).optional(),
  /** The donor verification level applicants are created against. */
  SUMSUB_LEVEL_NAME: z.string().default('id-and-liveness'),
  SUMSUB_API_BASE_URL: z.string().url().default('https://api.sumsub.com'),
  /** The recipient Sumsub clientId share tokens are minted for — Yodl's tenant. */
  SUMSUB_SHARE_FOR_CLIENT_ID: z.string().default('yodlpay.com'),

  /**
   * Openfort, server side. Two capabilities, four values, and only two of them
   * are secret.
   *
   * `OPENFORT_PUBLISHABLE_KEY` is who the attestation route believes the caller
   * is: the same public identifier the app ships as
   * `EXPO_PUBLIC_OPENFORT_PUBLISHABLE_KEY`, sent as `x-project-key` when we hand
   * an access token back to Openfort to be resolved. Absent → the attestation
   * route declines every request with a 404, because there is then no way to know
   * whose email we would be signing. That is the same quiet decline an unset
   * signing key produces, and it costs the user one OTP screen rather than
   * breaking signup.
   *
   * The three Shield values mint the single-use encryption sessions that make the
   * embedded wallet recoverable without a password. The publishable key is again
   * the app's own; the secret key and the encryption share are the two genuine
   * secrets in this block, and together they are equivalent to every user's
   * wallet — so they live only in this process and never in the bundle. Any of
   * the three absent → `/v1/openfort/encryption-session` answers 501, and the app
   * cannot create a wallet at all, which is the one optional capability here
   * whose absence is not merely an inconvenience.
   */
  OPENFORT_PUBLISHABLE_KEY: z.string().optional(),
  OPENFORT_SHIELD_PUBLISHABLE_KEY: z.string().optional(),
  OPENFORT_SHIELD_SECRET_KEY: z.string().optional(),
  OPENFORT_SHIELD_ENCRYPTION_SHARE: z.string().optional(),

  /** Where the payment store is persisted. Set to `:memory:` to disable. */
  NIGHTMARKET_DATA_FILE: z.string().default('.data/store.json'),

  /** `1` seeds a few stalls' worth of payments so the app has something to show. */
  NIGHTMARKET_SEED: z
    .string()
    .default('0')
    .transform((value) => value === '1' || value.toLowerCase() === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
