/**
 * Adding Yodl's amounts without going through a float.
 *
 * Yodl sends every amount as a string and the docs are blunt about it: "Do not
 * parse them into a float and back." The stats endpoint sums settlement amounts,
 * so it needs an addition that respects that.
 *
 * This used to be a hand-rolled decimal parser — a `Parsed` record, manual scale
 * alignment, and a re-assembly step that had to remember to trim trailing zeros
 * without eating a leading one. viem's `parseUnits`/`formatUnits` are that exact
 * pair of conversions, they are what the balance read on the device already uses,
 * and they are tested by somebody other than us. The tests in
 * `test/decimal.test.ts` did not change: they describe the behaviour, and it is
 * the same behaviour.
 */

import { formatUnits, parseUnits } from 'viem';

/** A plain decimal. No exponent, no separators, no currency symbol. */
const DECIMAL = /^-?\d*(\.\d*)?$/;

/**
 * Sum decimal strings exactly. Returns `null` if any input isn't a plain decimal —
 * the caller decides whether that's worth surfacing. Scientific notation is not
 * accepted, because Yodl doesn't emit it and silently accepting `1e3` here would
 * mean silently accepting it everywhere.
 */
export function sumDecimalStrings(values: readonly string[]): string | null {
  const amounts: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    // `parseUnits` throws on anything it can't read, and a thrown stats endpoint
    // is worse than one that declines to answer. This guard is what turns "not a
    // plain decimal" into `null`, and it is the only reason `1e3` stays out —
    // viem is perfectly willing to reject it, just not quietly.
    if (trimmed === '' || trimmed === '-' || !DECIMAL.test(trimmed)) return null;
    amounts.push(trimmed);
  }
  if (amounts.length === 0) return '0';

  // One common scale, taken from the longest fraction present. `parseUnits`
  // *rounds* anything past `decimals`, so a scale picked from the inputs is what
  // keeps this exact rather than merely precise.
  const scale = amounts.reduce((widest, amount) => {
    const fraction = amount.split('.')[1];
    return Math.max(widest, fraction?.length ?? 0);
  }, 0);

  const total = amounts.reduce((sum, amount) => sum + parseUnits(amount, scale), 0n);
  return formatUnits(total, scale);
}
