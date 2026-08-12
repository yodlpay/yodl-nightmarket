/**
 * The Sumsub side of Reusable KYC, with Nightmarket in the donor role.
 *
 * The flow this enables: a Nightmarket user has already passed KYC with *our*
 * Sumsub tenant. When they open the Yodl SDK, Yodl needs its own verification —
 * but Sumsub can copy ours instead of making the user photograph their passport
 * again. The handshake is a **share token**: single-use, short-lived, minted by
 * us (the donor) *for* Yodl's Sumsub tenant (`forClientId`), redeemed by Yodl's
 * backend, which imports the applicant and re-runs checks against its own level.
 * https://docs.sumsub.com/docs/reusable-kyc-share
 *
 * Every request is signed the same way: `HMAC-SHA256(ts + METHOD + path + body)`
 * with the app-token secret, hex-encoded. The signed path and body must
 * byte-match what goes on the wire, which is why `#request` builds both once and
 * hands the same values to the signer and to fetch.
 *
 * Sandbox only. The env schema refuses a non-`sbx:` token because two things in
 * here belong nowhere near production: `approveForDemo` fabricates an approval,
 * and a demo backend has no business holding keys to real PII.
 */

import { createHmac, randomUUID } from 'node:crypto';

export interface SumsubKycConfig {
  appToken: string;
  secretKey: string;
  /** The donor level applicants are created against. */
  levelName: string;
  baseUrl: string;
  /** The recipient tenant share tokens are minted for — Yodl's Sumsub clientId. */
  shareForClientId: string;
}

/** What the app needs to render a KYC state: nothing Sumsub-shaped leaks past here. */
export interface DonorKycStatus {
  applicantId: string | null;
  /** `none` before an applicant exists, then Sumsub's reviewStatus verbatim. */
  reviewStatus: string;
  reviewAnswer: 'GREEN' | 'RED' | null;
}

export class SumsubApiError extends Error {
  readonly status: number;
  constructor(status: number, description: string) {
    super(description);
    this.name = 'SumsubApiError';
    this.status = status;
  }
}

/**
 * A 1×1 white JPEG. Sandbox document checks don't read the pixels before
 * `testCompleted` forces a verdict, so the smallest valid JPEG there is keeps
 * the demo self-contained instead of shipping sample passports.
 */
const SAMPLE_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

export class SumsubKycClient {
  readonly #config: SumsubKycConfig;

  constructor(config: SumsubKycConfig) {
    this.#config = config;
  }

  get shareForClientId(): string {
    return this.#config.shareForClientId;
  }

  /** `none` when this wallet has never started KYC — a normal state, not an error. */
  async getStatus(externalUserId: string): Promise<DonorKycStatus> {
    try {
      const applicant = await this.#request(
        'GET',
        `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`,
      );
      return toStatus(applicant);
    } catch (error) {
      if (error instanceof SumsubApiError && error.status === 404) {
        return { applicantId: null, reviewAnswer: null, reviewStatus: 'none' };
      }
      throw error;
    }
  }

  /**
   * Mint a share token for an approved applicant. The token is the entire
   * hand-off: it goes to the app, the app gives it to the Yodl SDK, the SDK
   * posts it to Yodl's backend. We never see the redemption — Sumsub tells the
   * dashboard via `applicantShareTokenConsumed` if anyone cares to look.
   */
  async createShareToken(applicantId: string): Promise<{ token: string; forClientId: string }> {
    const response = await this.#request('POST', '/resources/accessTokens/shareToken', {
      applicantId,
      forClientId: this.#config.shareForClientId,
      ttlInSecs: 600,
    });

    const token =
      response && typeof response === 'object' && 'token' in response ? response.token : null;
    if (typeof token !== 'string') {
      throw new SumsubApiError(502, 'Sumsub share token response is malformed');
    }
    return { forClientId: this.#config.shareForClientId, token };
  }

  /**
   * Sandbox-only demo onboarding: create the applicant if needed, attach the
   * minimum documents the level wants, submit, and let the sandbox simulation
   * stamp a GREEN review. This stands in for a real KYC flow (WebSDK / MSDK)
   * that a production host wallet would already have.
   *
   * Idempotent per wallet: an existing applicant is reused, an already-approved
   * one returns as-is.
   */
  async approveForDemo(externalUserId: string): Promise<DonorKycStatus> {
    const current = await this.getStatus(externalUserId);
    if (current.reviewAnswer === 'GREEN') return current;

    let applicantId = current.applicantId;
    if (!applicantId) {
      const created = await this.#request(
        'POST',
        `/resources/applicants?levelName=${encodeURIComponent(this.#config.levelName)}`,
        { email: `${externalUserId}@nightmarket.example`, externalUserId },
      );
      applicantId =
        created && typeof created === 'object' && 'id' in created && typeof created.id === 'string'
          ? created.id
          : null;
      if (!applicantId) throw new SumsubApiError(502, 'Sumsub applicant response is malformed');
    }

    // The `id-and-liveness` level wants an IDENTITY doc and a SELFIE. Uploads
    // are idempotent enough for a demo: re-running just replaces the images.
    await this.#uploadDocument(applicantId, { country: 'DEU', idDocType: 'PASSPORT' });
    await this.#uploadDocument(applicantId, { country: 'DEU', idDocType: 'SELFIE' });

    // Submit, then let the sandbox simulate the review outcome. `pending` can
    // 409 if a previous run already submitted — that is fine, the simulation
    // still applies.
    await this.#request('POST', `/resources/applicants/${applicantId}/status/pending`).catch(
      (error) => {
        if (!(error instanceof SumsubApiError && error.status === 409)) throw error;
      },
    );
    await this.#request('POST', `/resources/applicants/${applicantId}/status/testCompleted`, {
      rejectLabels: [],
      reviewAnswer: 'GREEN',
    });

    return this.getStatus(externalUserId);
  }

  async #uploadDocument(
    applicantId: string,
    metadata: { idDocType: string; country: string },
  ): Promise<void> {
    const boundary = `----nightmarket${randomUUID().replace(/-/g, '')}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="content"; filename="doc.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      SAMPLE_JPEG,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    await this.#request('POST', `/resources/applicants/${applicantId}/info/idDoc`, body, {
      contentType: `multipart/form-data; boundary=${boundary}`,
    });
  }

  async #request(
    method: 'GET' | 'POST',
    pathWithQuery: string,
    body?: Record<string, unknown> | Buffer,
    options: { contentType?: string } = {},
  ): Promise<unknown> {
    const bodyBytes =
      body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000);

    const hmac = createHmac('sha256', this.#config.secretKey).update(
      `${timestamp}${method}${pathWithQuery}`,
    );
    if (bodyBytes !== undefined) hmac.update(bodyBytes);

    const response = await fetch(`${this.#config.baseUrl}${pathWithQuery}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(bodyBytes !== undefined
          ? { 'Content-Type': options.contentType ?? 'application/json' }
          : {}),
        'X-App-Token': this.#config.appToken,
        'X-App-Access-Ts': String(timestamp),
        'X-App-Access-Sig': hmac.digest('hex'),
      },
      ...(bodyBytes !== undefined ? { body: bodyBytes as RequestInit['body'] } : {}),
      signal: AbortSignal.timeout(10_000),
    });

    const json = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const description =
        json && typeof json === 'object' && 'description' in json
          ? String((json as { description: unknown }).description)
          : `Sumsub request failed (${response.status})`;
      throw new SumsubApiError(response.status, description);
    }
    return json;
  }
}

function toStatus(applicant: unknown): DonorKycStatus {
  const record = (applicant ?? {}) as {
    id?: unknown;
    review?: { reviewStatus?: unknown; reviewResult?: { reviewAnswer?: unknown } };
  };
  const answer = record.review?.reviewResult?.reviewAnswer;

  return {
    applicantId: typeof record.id === 'string' ? record.id : null,
    reviewAnswer: answer === 'GREEN' || answer === 'RED' ? answer : null,
    reviewStatus:
      typeof record.review?.reviewStatus === 'string' ? record.review.reviewStatus : 'none',
  };
}
