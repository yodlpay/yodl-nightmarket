/**
 * The payment store, and the reconciliation join that gives it its shape.
 *
 * Two independent streams land here:
 *
 *   **Intents** — our own app saying "I just sent this hash". Trusted, because we
 *   wrote it, but it knows nothing about whether the payment succeeded.
 *
 *   **Deliveries** — Yodl's signed webhooks. Authentic (the HMAC proves Yodl sent
 *   them) but *unauthenticated as to origin*: a payment's integration address is
 *   written into on-chain metadata by whoever builds the payment, so anyone can
 *   write ours. A delivery proves some payment claimed us. It does not prove the
 *   payment came from our app.
 *
 * Joining them on `chainId:txHash` is the reconciliation the Yodl docs ask for.
 * A record that has both is `matched` and is safe to show a user. A delivery with
 * no intent is `unmatched` — kept, never shown as the user's own, because that is
 * exactly what somebody else claiming our integration address looks like.
 *
 * Persistence is a JSON file. This is a demo: the interface below is the part that
 * would survive a move to Postgres, and none of it assumes the store is in memory.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  Attribution,
  NightmarketPayment,
  PaymentNotification,
  PaymentPage,
  PaymentState,
  Stats,
} from '@nightmarket/shared';
import { isNewerSnapshot, isSameAddress, paymentKey } from '@nightmarket/shared';
import { sumDecimalStrings } from './decimal';

export interface RecordIntentInput {
  chainId: string;
  txHash: string;
  wallet: string;
  memo?: string;
}

/** Why a delivery was not stored. Every one of these is a normal outcome. */
export type DeliveryOutcome =
  | { accepted: true; payment: NightmarketPayment }
  | { accepted: false; reason: 'stale_version'; payment: NightmarketPayment };

export interface ListOptions {
  wallet?: string;
  attribution?: Attribution;
  limit?: number;
  cursor?: string | null;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export class PaymentStore {
  #records = new Map<string, NightmarketPayment>();
  #filePath: string | null;
  /** Serializes writes so two rapid deliveries can't interleave a half-written file. */
  #writeChain: Promise<void> = Promise.resolve();

  constructor(filePath: string | null) {
    this.#filePath = filePath === ':memory:' ? null : filePath;
  }

  /** Load whatever a previous run persisted. A missing or corrupt file starts empty. */
  async hydrate(): Promise<void> {
    if (!this.#filePath) return;
    try {
      const raw = await readFile(this.#filePath, 'utf8');
      const entries = JSON.parse(raw) as NightmarketPayment[];
      for (const entry of entries) {
        this.#records.set(paymentKey(entry.chainId, entry.txHash), entry);
      }
    } catch {
      // No file yet, or one we can't read. Either way: start clean rather than
      // refuse to boot — a demo backend that won't start because of a stale
      // cache file is worse than one that forgets.
    }
  }

  /**
   * Record what our app just sent.
   *
   * Idempotent on `chainId:txHash`: the app may retry, and a second intent for a
   * hash we already know must not reset a delivery that has since landed. If a
   * delivery got here first (possible — Yodl indexes fast) the record is upgraded
   * from `unmatched` to `matched` in place, which is the whole point of keeping
   * unmatched deliveries rather than dropping them.
   */
  recordIntent(input: RecordIntentInput): NightmarketPayment {
    const key = paymentKey(input.chainId, input.txHash);
    const now = new Date().toISOString();
    const existing = this.#records.get(key);

    const record: NightmarketPayment = existing
      ? {
          ...existing,
          wallet: existing.wallet ?? input.wallet.toLowerCase(),
          intentAt: existing.intentAt ?? now,
          attribution: existing.version === null ? 'pending' : 'matched',
        }
      : {
          chainId: input.chainId,
          txHash: input.txHash.toLowerCase(),
          version: null,
          state: null,
          recipient: input.memo ? { title: input.memo, subtitle: null } : null,
          invoice: null,
          attribution: 'pending',
          wallet: input.wallet.toLowerCase(),
          intentAt: now,
          notifiedAt: null,
        };

    this.#records.set(key, record);
    this.#persist();
    return record;
  }

  /**
   * Apply a verified delivery.
   *
   * The caller has already checked the signature; this is the second gate. Yodl's
   * deliveries are unordered — the same payment can arrive twice and a later state
   * can arrive before an earlier one — so a snapshot is applied only if its
   * `version` is strictly greater than the stored one. Everything else is a replay
   * or an out-of-order duplicate, and dropping it silently is correct.
   *
   * A delivery is keyed on the pair it carries, which is Yodl's **destination**
   * chain and hash. Our intent is keyed on what the app's own wallet broadcast — the
   * source. Those are the same string for a same-chain payment and different for a
   * bridged one, and the payload carries nothing to bridge the gap, so a bridged
   * payment's delivery has no intent to find and is filed `unmatched`. See the
   * `source/destination identity` test for the shape of that.
   */
  applyDelivery(notification: PaymentNotification): DeliveryOutcome {
    const key = paymentKey(notification.chainId, notification.txHash);
    const existing = this.#records.get(key);

    if (existing && !isNewerSnapshot(notification.version, existing.version ?? undefined)) {
      return { accepted: false, reason: 'stale_version', payment: existing };
    }

    const record: NightmarketPayment = {
      chainId: notification.chainId,
      txHash: notification.txHash.toLowerCase(),
      version: notification.version,
      state: notification.state,
      recipient: notification.recipient,
      invoice: notification.invoice,
      // An intent we already hold is what turns this from a claim into our sale.
      attribution: existing?.intentAt ? 'matched' : 'unmatched',
      wallet: existing?.wallet ?? null,
      intentAt: existing?.intentAt ?? null,
      notifiedAt: new Date().toISOString(),
    };

    this.#records.set(key, record);
    this.#persist();
    return { accepted: true, payment: record };
  }

  get(chainId: string, txHash: string): NightmarketPayment | undefined {
    return this.#records.get(paymentKey(chainId, txHash));
  }

  /**
   * Newest first, cursor-paginated.
   *
   * The cursor is the sort key of the last row returned, base64'd — opaque to the
   * client, stable under inserts, and it does not shift the way an offset does
   * when a delivery lands mid-scroll.
   */
  list(options: ListOptions = {}): PaymentPage {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    let rows = [...this.#records.values()];
    // `isSameAddress` rather than `options.wallet?.toLowerCase() === row.wallet`.
    // Same answer today — the store lowercases what it writes and the old filter
    // lowercased what it was asked — but the two conventions were load-bearing and
    // invisible, and either one drifting turns this into an empty feed, which
    // reads exactly like a wallet that has never paid for anything. viem's
    // comparison asks the question the filter means: same account.
    const wallet = options.wallet;
    if (wallet) rows = rows.filter((row) => isSameAddress(row.wallet, wallet));
    if (options.attribution) rows = rows.filter((row) => row.attribution === options.attribution);

    rows.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

    if (options.cursor) {
      const after = decodeCursor(options.cursor);
      if (after) {
        const index = rows.findIndex((row) => sortKey(row) === after);
        rows = index === -1 ? rows : rows.slice(index + 1);
      }
    }

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const hasMore = rows.length > page.length;

    return {
      payments: page,
      nextCursor: hasMore && last ? encodeCursor(sortKey(last)) : null,
    };
  }

  stats(): Stats {
    const byState: Partial<Record<PaymentState, number>> = {};
    const settlementsByCurrency = new Map<string, string[]>();
    let matched = 0;
    let pending = 0;
    let unmatched = 0;
    let lastDeliveryAt: string | null = null;

    for (const record of this.#records.values()) {
      if (record.attribution === 'matched') matched += 1;
      else if (record.attribution === 'pending') pending += 1;
      else unmatched += 1;

      if (record.state) byState[record.state] = (byState[record.state] ?? 0) + 1;

      if (record.notifiedAt && (!lastDeliveryAt || record.notifiedAt > lastDeliveryAt)) {
        lastDeliveryAt = record.notifiedAt;
      }

      // Only money we can prove we originated, and only once it has settled.
      if (record.attribution === 'matched' && record.state === 'success' && record.invoice) {
        const bucket = settlementsByCurrency.get(record.invoice.settlementCurrency) ?? [];
        bucket.push(record.invoice.settlementAmount);
        settlementsByCurrency.set(record.invoice.settlementCurrency, bucket);
      }
    }

    const settled: Record<string, string> = {};
    for (const [currency, amounts] of settlementsByCurrency) {
      settled[currency] = sumDecimalStrings(amounts) ?? '0';
    }

    return { matched, pending, unmatched, byState, settled, lastDeliveryAt };
  }

  /** Test seam — lets a test start from a known set without touching the disk. */
  seed(records: readonly NightmarketPayment[]): void {
    for (const record of records) {
      this.#records.set(paymentKey(record.chainId, record.txHash), record);
    }
    this.#persist();
  }

  get size(): number {
    return this.#records.size;
  }

  /** Flush pending writes. Used on shutdown and by tests. */
  async flush(): Promise<void> {
    await this.#writeChain;
  }

  /**
   * Write-through, but never in the request's critical path and never two at once.
   * Chaining onto `#writeChain` means a burst of deliveries produces a burst of
   * sequential writes rather than a torn file; write-to-temp-then-rename means a
   * crash mid-write leaves the previous good file rather than half of this one.
   */
  #persist(): void {
    const filePath = this.#filePath;
    if (!filePath) return;
    const snapshot = JSON.stringify([...this.#records.values()], null, 2);

    this.#writeChain = this.#writeChain
      .then(async () => {
        await mkdir(dirname(filePath), { recursive: true });
        const temp = `${filePath}.${process.pid}.tmp`;
        await writeFile(temp, snapshot, 'utf8');
        await rename(temp, filePath);
      })
      .catch((error) => {
        console.error('[store] failed to persist:', error);
      });
  }
}

/**
 * Sort by when we last heard anything about the payment, falling back to when we
 * sent it. `txHash` is appended so two events in the same millisecond still have a
 * total order — without it the cursor could never point at one of them uniquely.
 */
function sortKey(record: NightmarketPayment): string {
  return `${record.notifiedAt ?? record.intentAt ?? ''}#${record.txHash}`;
}

const encodeCursor = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

function decodeCursor(cursor: string): string | null {
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}
