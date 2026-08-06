/**
 * Verification of the `X-Yodl-Signature` header on payment notifications.
 *
 * https://docs.yodl.me/integrations/notifications
 *
 * The signed string is `"<t>" + "." + <raw body bytes>`, HMAC-SHA256 keyed on the
 * webhook signing secret, hex encoded lowercase. Three details in that sentence
 * are load-bearing and each has cost somebody a day:
 *
 *  1. **Raw bytes, not a re-serialized object.** `JSON.stringify(await c.req.json())`
 *     produces different bytes for the same document — key order alone is enough.
 *     The route reads `await c.req.text()` first and hands that string here.
 *  2. **Constant-time comparison.** `a === b` on hex strings returns early at the
 *     first differing character, and that timing difference is enough to recover a
 *     valid signature byte by byte.
 *  3. **A freshness window.** Without one, a delivery captured today verifies
 *     forever. The signature says the body is authentic; the timestamp is what
 *     says it is *current*.
 *
 * The header is parsed as a comma-separated list of `name=value` fields, and
 * unknown fields are ignored. `v1` is a scheme version, not a key version — a
 * future delivery may carry `t=…,v1=…,v2=…` mid-rotation, and a parser that
 * assumes exactly two fields will break on it.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** How far a delivery's timestamp may sit from our clock. Yodl's own guidance. */
export const TOLERANCE_SECONDS = 5 * 60;

export type SignatureFailure =
  | 'missing_header'
  | 'malformed_header'
  | 'stale_timestamp'
  | 'bad_signature';

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

/** Parse `t=…,v1=…` into a map. Tolerates whitespace and unknown fields. */
export function parseSignatureHeader(header: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    fields.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return fields;
}

/**
 * @param header   The raw `X-Yodl-Signature` value.
 * @param rawBody  The request body exactly as received — never a re-serialization.
 * @param secret   Your webhook signing secret.
 * @param nowMs    Injectable clock, so tests can pin the freshness window.
 */
export function verifyYodlSignature(
  header: string | undefined | null,
  rawBody: string,
  secret: string,
  nowMs: number = Date.now(),
): SignatureResult {
  if (!header) return { ok: false, reason: 'missing_header' };

  const fields = parseSignatureHeader(header);
  const timestamp = fields.get('t');
  const signature = fields.get('v1');
  if (!timestamp || !signature) return { ok: false, reason: 'malformed_header' };

  const age = Math.abs(Math.floor(nowMs / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();

  // A malformed hex string decodes to a short buffer rather than throwing, and
  // timingSafeEqual throws outright on a length mismatch — so the length check
  // has to come first, and it leaks nothing a caller doesn't already know.
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'hex');
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  if (received.length !== expected.length) return { ok: false, reason: 'bad_signature' };

  return timingSafeEqual(expected, received)
    ? { ok: true }
    : { ok: false, reason: 'bad_signature' };
}

/**
 * Produce a delivery signature. Only used by the tests and by `scripts/send-webhook.ts`,
 * which replays a delivery at the local server — Yodl signs the real ones.
 */
export function signYodlDelivery(rawBody: string, secret: string, atSeconds: number): string {
  const v1 = createHmac('sha256', secret).update(`${atSeconds}.${rawBody}`).digest('hex');
  return `t=${atSeconds},v1=${v1}`;
}
