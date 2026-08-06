/**
 * The worked example in the Yodl docs is pinned by a test on their side, so it
 * cannot drift from what they actually send. Pinning it here too means our
 * verifier is checked against their signer rather than against itself — a
 * round-trip test (sign, then verify with the same code) would pass just as
 * happily with the wrong signed-string construction on both ends.
 *
 * https://docs.yodl.me/integrations/notifications#worked-example
 */

import { describe, expect, it } from 'vitest';
import { parseSignatureHeader, signYodlDelivery, verifyYodlSignature } from '../src/lib/signature';

const SECRET = 'integration-example-secret';
const TIMESTAMP = 1785153600;
const SIGNATURE = '6ced28eb0f662564c0b4e43592bf376caeb042775d4abaa93a008781e1e38071';

// One line, no trailing newline, no reformatting. Byte-for-byte or the test is
// worthless — that is the entire point of the example.
const BODY =
  '{"integrationAddress":"0x5f2f6f387f49f7cfe0f6f302ff7f6ba6748b6ff1","chainId":"8453","txHash":"0x82aa1e4f552e56f68c92d3cf3fdccbcafb51905c356ba163a4ae84631f416b96","version":3,"state":"success","recipient":{"title":"Acme GmbH","subtitle":"Vietcombank 0123"},"invoice":{"amount":"12345","currency":"VND","settlementAmount":"0.48","settlementCurrency":"USD"}}';

/** The example's timestamp is fixed and long past, so the clock is pinned to it. */
const AT_ISSUE = TIMESTAMP * 1000;

describe('verifyYodlSignature', () => {
  it("accepts Yodl's pinned worked example", () => {
    const header = `t=${TIMESTAMP},v1=${SIGNATURE}`;
    expect(verifyYodlSignature(header, BODY, SECRET, AT_ISSUE)).toEqual({ ok: true });
  });

  it('produces that exact signature when signing the same bytes', () => {
    expect(signYodlDelivery(BODY, SECRET, TIMESTAMP)).toBe(`t=${TIMESTAMP},v1=${SIGNATURE}`);
  });

  it('rejects a body that differs by a single byte', () => {
    const tampered = BODY.replace('"amount":"12345"', '"amount":"12346"');
    const header = `t=${TIMESTAMP},v1=${SIGNATURE}`;
    expect(verifyYodlSignature(header, tampered, SECRET, AT_ISSUE)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a re-serialized body even when the document is identical', () => {
    // JSON.parse → JSON.stringify preserves the document and changes the bytes
    // (spacing here, key order elsewhere). This is the mistake the raw-body rule
    // exists to prevent, so it gets its own test.
    const reserialized = JSON.stringify(JSON.parse(BODY), null, 2);
    const header = `t=${TIMESTAMP},v1=${SIGNATURE}`;
    expect(verifyYodlSignature(header, reserialized, SECRET, AT_ISSUE)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a valid signature outside the freshness window', () => {
    const header = `t=${TIMESTAMP},v1=${SIGNATURE}`;
    const sixMinutesLater = AT_ISSUE + 6 * 60 * 1000;
    expect(verifyYodlSignature(header, BODY, SECRET, sixMinutesLater)).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
  });

  it('accepts a delivery inside the window in either direction', () => {
    const header = `t=${TIMESTAMP},v1=${SIGNATURE}`;
    expect(verifyYodlSignature(header, BODY, SECRET, AT_ISSUE + 4 * 60 * 1000).ok).toBe(true);
    expect(verifyYodlSignature(header, BODY, SECRET, AT_ISSUE - 4 * 60 * 1000).ok).toBe(true);
  });

  it('rejects the wrong secret', () => {
    const header = `t=${TIMESTAMP},v1=${SIGNATURE}`;
    expect(verifyYodlSignature(header, BODY, 'not-the-secret', AT_ISSUE)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it.each([
    ['a missing header', undefined, 'missing_header'],
    ['an empty header', '', 'missing_header'],
    ['a header with no v1', `t=${TIMESTAMP}`, 'malformed_header'],
    ['a header with no t', `v1=${SIGNATURE}`, 'malformed_header'],
    ['a non-hex signature', `t=${TIMESTAMP},v1=zzzz`, 'bad_signature'],
    ['a truncated signature', `t=${TIMESTAMP},v1=${SIGNATURE.slice(0, 32)}`, 'bad_signature'],
  ])('rejects %s', (_label, header, reason) => {
    expect(verifyYodlSignature(header, BODY, SECRET, AT_ISSUE)).toEqual({ ok: false, reason });
  });

  it('ignores unrecognised fields, so a future v2 does not break v1', () => {
    // The docs warn that a delivery may carry several schemes mid-rotation. A
    // parser that assumes exactly two fields breaks on the day that happens.
    const header = `t=${TIMESTAMP},v1=${SIGNATURE},v2=deadbeef`;
    expect(verifyYodlSignature(header, BODY, SECRET, AT_ISSUE)).toEqual({ ok: true });
  });
});

describe('parseSignatureHeader', () => {
  it('tolerates whitespace around fields', () => {
    const fields = parseSignatureHeader(' t=1 , v1=abc ');
    expect(fields.get('t')).toBe('1');
    expect(fields.get('v1')).toBe('abc');
  });

  it('keeps everything after the first = , so a padded value survives', () => {
    expect(parseSignatureHeader('v1=a=b').get('v1')).toBe('a=b');
  });
});
