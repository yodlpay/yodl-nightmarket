/**
 * Replay a signed payment notification at the local server.
 *
 *   pnpm --filter @nightmarket/api exec tsx scripts/send-webhook.ts
 *   pnpm --filter @nightmarket/api exec tsx scripts/send-webhook.ts 0xabc… success 4
 *
 * Yodl signs the real ones; this signs a fake one with the same secret so the
 * whole path — signature, version gate, reconciliation — can be exercised without
 * a tunnel and without waiting for a payment to actually happen.
 *
 * Send it for a hash the app has already posted an intent for and the record comes
 * out `matched`. Send it for a hash nobody claimed and it comes out `unmatched`,
 * which is the more instructive of the two.
 */

import { signYodlDelivery } from '../src/lib/signature';

const API = process.env.API_URL ?? 'http://localhost:8787';
const SECRET = process.env.YODL_WEBHOOK_SIGNING_SECRET ?? 'integration-example-secret';
const INTEGRATION = (
  process.env.YODL_INTEGRATION_ADDRESS ?? '0x0000000000000000000000000000000000000000'
).toLowerCase();

const txHash = process.argv[2] ?? `0x${'ab'.repeat(32)}`;
const state = process.argv[3] ?? 'success';
const version = Number(process.argv[4] ?? 1);

// Serialize once and sign *these* bytes — the same discipline the receiver needs.
// Re-stringifying before the fetch would produce a body the signature doesn't cover.
const body = JSON.stringify({
  integrationAddress: INTEGRATION,
  chainId: '8453',
  txHash,
  version,
  state,
  recipient: { title: 'Bánh Mì Cô Ba', subtitle: 'Vietcombank 0123' },
  invoice: {
    amount: '45000',
    currency: 'VND',
    settlementAmount: '1.72',
    settlementCurrency: 'USD',
  },
});

const signature = signYodlDelivery(body, SECRET, Math.floor(Date.now() / 1000));

const response = await fetch(`${API}/webhooks/yodl`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Yodl-Integration': INTEGRATION,
    'X-Yodl-Signature': signature,
  },
  body,
});

console.log(`${response.status} ${await response.text()}`);
