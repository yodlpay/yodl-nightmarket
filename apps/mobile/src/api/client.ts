/**
 * Typed client for the Nightmarket API.
 *
 * Responses are parsed through the same Zod schemas the server validates against,
 * so a contract drift surfaces here as a parse error naming the field rather than
 * three screens later as `undefined is not an object`.
 */

import type { NightmarketPayment, PaymentPage, Stats } from '@nightmarket/shared';
import {
  nightmarketPaymentSchema,
  paymentPageSchema,
  routes,
  statsSchema,
} from '@nightmarket/shared';
import { env } from '~/env';
import { debug, redactToken } from '~/lib/log';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Long enough for a cold serverless start, short enough that a pull-to-refresh ends. */
const TIMEOUT_MS = 10_000;

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    // The overwhelmingly common cause on a device is EXPO_PUBLIC_API_URL pointing
    // at localhost, which on a phone is the phone. Say so instead of "Network
    // request failed".
    throw new ApiError(
      0,
      `Can't reach the Nightmarket API at ${env.apiUrl}. On a physical device, ` +
        "localhost is the phone — set EXPO_PUBLIC_API_URL to your machine's LAN IP. " +
        `(${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ApiError(response.status, body || `API responded ${response.status}`);
  }

  return response.json();
}

export const api = {
  /**
   * Tell the backend we just sent a transaction, so the webhook that follows can
   * be reconciled against it.
   *
   * Called from `onTransactionSent`. Failure is not surfaced to the user: the
   * payment itself is already in flight and unaffected — the only consequence is
   * that the delivery arrives with nothing to match and lands as `unmatched`.
   */
  async recordIntent(input: {
    chainId: number;
    txHash: string;
    wallet: string;
    memo?: string;
  }): Promise<void> {
    await request(routes.intents, {
      method: 'POST',
      body: JSON.stringify({ ...input, chainId: String(input.chainId) }),
    });
  },

  /**
   * One page of a wallet's payments.
   *
   * `cursor` is the `nextCursor` of the page before it, and it is opaque on
   * purpose — the backend's is the sort key of the last row, base64'd, which is
   * stable under inserts in a way an offset is not. A delivery landing while the
   * user scrolls shifts every offset by one and would show them a row twice;
   * it does not move a cursor.
   */
  async walletPayments(address: string, cursor?: string | null): Promise<PaymentPage> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return paymentPageSchema.parse(await request(`${routes.walletPayments(address)}${query}`));
  },

  /**
   * One payment, by the pair that identifies it everywhere else in the system.
   *
   * A miss is a 404 rather than a `null` body, so it arrives here as an
   * `ApiError` with `status === 404` — which is what lets the detail screen tell
   * "we have never heard of this" apart from "the backend is unreachable". The
   * two deserve different screens and the status code is the only thing that
   * separates them.
   */
  async payment(chainId: string, txHash: string): Promise<NightmarketPayment> {
    return nightmarketPaymentSchema.parse(await request(routes.payment(chainId, txHash)));
  },

  async stats(): Promise<Stats> {
    return statsSchema.parse(await request(routes.stats));
  },

  /**
   * A single-use Shield encryption session, so the embedded signer can build or
   * recover its key share without anybody typing a password.
   *
   * Shield's own credentials — the secret key and the encryption share — never
   * leave `apps/api`; this route is the only thing the device is allowed to ask
   * for, and it answers only for the caller named by the bearer token. Openfort's
   * alternative wiring, `createEncryptedSessionEndpoint`, posts to a URL with no
   * `Authorization` header at all, which would leave the route minting wallet
   * recovery material for anyone who knows its address.
   *
   * Every failure throws. The caller is the SDK's `getEncryptionSession`
   * callback, where a rejection is the only way to say "no wallet today" — a
   * resolved empty string is taken as a session id and fails later, somewhere
   * far less legible.
   */
  async encryptionSession(accessToken: string): Promise<string> {
    const body = await request(routes.encryptionSession, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const { session } = body as { session?: unknown };
    if (typeof session !== 'string' || session === '') {
      throw new Error('The encryption-session route answered without a session id.');
    }
    return session;
  },

  /**
   * Mint an email attestation so the user can skip Yodl's OTP during signup.
   *
   * The body names a wallet and nothing else. The email is not ours to propose —
   * the backend verifies the Openfort access token on the `Authorization` header
   * and signs the address Openfort has on file for whoever that token belongs to.
   * The token is passed in rather than read here because this module is a plain
   * one and `getAccessToken` is a hook; threading it down from
   * `useEmailAttestation` keeps the client free of React and of Openfort both.
   *
   * Returns `null` on any failure — a missing attestation is a normal outcome
   * that costs the user one extra screen, never an error worth interrupting a
   * signup flow for. The `signal` comes from Yodl and aborts on timeout, unmount
   * or session change; forwarding it is what keeps a slow mint from holding the
   * flow open past the 30-second budget.
   */
  async emailAttestation(
    walletAddress: string,
    accessToken: string,
    signal: AbortSignal,
  ): Promise<{ token: string; email?: string } | null> {
    const url = `${env.apiUrl}${routes.emailAttestation}`;
    debug('attest', `POST ${url}`, { walletAddress, accessToken: redactToken(accessToken) });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ walletAddress }),
        signal,
      });

      if (!response.ok) {
        // 404 is the backend saying "I have no verified email for this wallet",
        // which is a normal decline, not a fault. Anything else is worth seeing.
        const body = await response.text().catch(() => '');
        debug('attest', `declined — HTTP ${response.status}`, body.slice(0, 200));
        return null;
      }

      const result = (await response.json()) as { token: string; email?: string };
      debug('attest', 'minted', {
        token: redactToken(result.token),
        email: result.email ?? '(none)',
      });
      return result;
    } catch (cause) {
      // Yodl aborts this on its own 30s budget, on unmount, and on session
      // change — all expected, and all land here looking like a failure.
      const aborted = signal.aborted;
      debug('attest', aborted ? 'aborted by Yodl' : 'request failed', String(cause));
      return null;
    }
  },
};
