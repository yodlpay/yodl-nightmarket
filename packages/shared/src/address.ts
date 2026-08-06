/**
 * Addresses and hashes, handled by viem rather than by string comparison.
 *
 * Every 0x string in this system arrives from somewhere that decides its own
 * casing: Yodl lowercases identifiers on the way out, Privy hands back an EIP-55
 * checksummed address, a URL param is whatever the user typed. Treating those as
 * plain strings works until the day two of them meet — a feed filtered with
 * `===` against a checksummed address returns nothing, and looks exactly like a
 * wallet with no payments.
 */

import { getAddress, isAddress, isAddressEqual } from 'viem';

/**
 * Are these the same account?
 *
 * `a.toLowerCase() === b.toLowerCase()` is what this replaced, and it answers a
 * subtly different question: whether two strings match. Anything that is not an
 * address is not equal to anything, including itself — a filter is not the place
 * to decide that a malformed input might have meant something.
 */
export function isSameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  // `strict: false` accepts either casing. Requiring a valid checksum here would
  // reject the lowercase form Yodl sends, which is the common case.
  if (!isAddress(a, { strict: false }) || !isAddress(b, { strict: false })) return false;
  return isAddressEqual(a, b);
}

/**
 * `0x1234…cdef`. Middle-truncated, because both ends are what people recognise.
 *
 * Checksummed first when the input really is an address: EIP-55's mixed case is
 * what lets someone compare the string on screen against the one in their wallet
 * a character at a time, and it is exactly the information a lowercase copy from
 * a webhook has thrown away. Anything that isn't an address is truncated as-is
 * rather than rejected — this is a display helper, and a screen showing a
 * malformed value is more useful than one showing nothing.
 */
export function truncateAddress(address: string, lead = 6, tail = 4): string {
  const display = isAddress(address, { strict: false }) ? getAddress(address) : address;
  if (display.length <= lead + tail + 1) return display;
  return `${display.slice(0, lead)}…${display.slice(-tail)}`;
}

/**
 * Same idea, wider window — a hash has no memorable prefix beyond `0x`.
 *
 * No checksumming: EIP-55 is defined over addresses only, and a transaction hash
 * has no case to be meaningful.
 */
export const truncateHash = (hash: string): string => {
  if (hash.length <= 19) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
};
