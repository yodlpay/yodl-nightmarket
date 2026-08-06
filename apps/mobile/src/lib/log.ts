/**
 * Dev-only logging, on one tag so it can be found and removed.
 *
 * Everything goes out under `[nm:<scope>]`, which makes the whole app's debug
 * output greppable in a Metro window that is otherwise full of other people's
 * warnings:
 *
 *     adb logcat | grep 'nm:'
 *
 * `__DEV__` is a compile-time constant, so these calls are stripped from a
 * release bundle rather than merely silenced — which matters here, because the
 * attestation path logs email addresses and token fragments that have no
 * business in a production log.
 */

export function debug(scope: string, message: string, detail?: unknown): void {
  if (!__DEV__) return;
  if (detail === undefined) console.log(`[nm:${scope}] ${message}`);
  else console.log(`[nm:${scope}] ${message}`, detail);
}

/** Same tag, but for things that are genuinely wrong. Kept in release builds. */
export function warn(scope: string, message: string, detail?: unknown): void {
  if (detail === undefined) console.warn(`[nm:${scope}] ${message}`);
  else console.warn(`[nm:${scope}] ${message}`, detail);
}

/**
 * A token is a credential, even a 2-minute one. Enough to correlate a log line
 * with a request, not enough to replay.
 */
export const redactToken = (token: string): string =>
  `${token.slice(0, 10)}…${token.slice(-6)} (${token.length} chars)`;
