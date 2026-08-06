import { describe, expect, it } from 'vitest';
import { sumDecimalStrings } from '../src/lib/decimal';

describe('sumDecimalStrings', () => {
  it('sums without the float error that motivates it', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in binary floating point. A settlement
    // total that reads 0.30000000000000004 is the bug this module exists for.
    expect(sumDecimalStrings(['0.1', '0.2'])).toBe('0.3');
  });

  it('aligns operands of different scales', () => {
    expect(sumDecimalStrings(['1.5', '2.25', '0.005'])).toBe('3.755');
  });

  it('keeps large integer amounts exact', () => {
    // VND invoices run to seven figures and there are more of them than any
    // other currency Yodl supports.
    expect(sumDecimalStrings(['45000', '30000', '1250000'])).toBe('1325000');
  });

  it('trims trailing zeros but never a leading one', () => {
    expect(sumDecimalStrings(['1.50', '0.50'])).toBe('2');
    expect(sumDecimalStrings(['0.25', '0.25'])).toBe('0.5');
  });

  it('handles negatives, for refunds', () => {
    expect(sumDecimalStrings(['10.00', '-2.50'])).toBe('7.5');
    expect(sumDecimalStrings(['1.00', '-3.25'])).toBe('-2.25');
  });

  it('is 0 for an empty set', () => {
    expect(sumDecimalStrings([])).toBe('0');
  });

  it('refuses anything that is not a plain decimal', () => {
    // Yodl does not emit scientific notation, and accepting it here would mean
    // accepting it silently everywhere downstream.
    expect(sumDecimalStrings(['1e3'])).toBeNull();
    expect(sumDecimalStrings(['1.2.3'])).toBeNull();
    expect(sumDecimalStrings([''])).toBeNull();
    expect(sumDecimalStrings(['abc'])).toBeNull();
  });
});
