/**
 * Formatters shared by the app and the API, so a currency renders the same way
 * in a push-notification title as it does on a list row.
 *
 * Everything takes the string amounts Yodl sends and returns a string. Nothing
 * here parses an amount into a `number` and back — a VND invoice is routinely
 * six or seven digits and a float round trip is a silent corruption.
 *
 * The 0x strings moved to `address.ts` and the chain tables to `chains.ts`, both
 * of which are viem's job now.
 */

/**
 * Format a Yodl amount for display.
 *
 * `Intl.NumberFormat` is used when it's available. Hermes ships it on modern
 * React Native, but the fallback is not defensive theatre: the same code runs on
 * the API under Node with a full ICU, and on a device where an unusual locale
 * build can still throw on an unknown currency code. A thrown formatter on a
 * payment row is a blank screen, so it degrades to grouped digits instead.
 */
export function formatAmount(amount: string, currency?: string | null): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;

  // Crypto-ish settlement amounts need decimals; fiat minor units vary by
  // currency, so let Intl decide when it can and only cap the long tail.
  const fractionDigits = Math.abs(value) < 1 ? 4 : 2;

  if (currency) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: fractionDigits,
      }).format(value);
    } catch {
      // Unknown or unsupported currency code — fall through to plain grouping.
    }
  }

  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: fractionDigits }).format(value);
  } catch {
    return amount;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now" / "4m" / "3h" / "2d", then an absolute date past a week.
 *
 * Deliberately coarse. A payment feed is scanned, not read, and "14 minutes ago"
 * costs more width than it returns in meaning.
 */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';

  const delta = now - then;
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d`;

  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(then);
  } catch {
    return new Date(then).toISOString().slice(0, 10);
  }
}
