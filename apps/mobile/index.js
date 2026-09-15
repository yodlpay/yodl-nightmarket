/**
 * The app's real entry point: polyfills first, then Expo Router.
 *
 * Hermes is a JS engine, not a browser. It has no `crypto` and no `TextEncoder`,
 * and the wallet stack assumes both — `@noble/hashes` opens with
 * `'crypto' in globalThis ? globalThis.crypto : undefined`, and viem reaches for
 * the encoder while building call data.
 *
 * Without these the app dies before rendering, with `ReferenceError: Property
 * 'crypto' doesn't exist` repeated once per module, followed by a pile of
 * "Route is missing the required default export" warnings. Those warnings are a
 * red herring: the routes export fine, they just never finished evaluating,
 * because the polyfill was missing underneath them.
 *
 * Ordering is the whole point of this file. `expo-router/entry` pulls in the
 * route tree, which pulls in the Openfort SDK, which touches `crypto` at module
 * scope — so the polyfills cannot live in `app/_layout.tsx`, which is itself part
 * of that graph and therefore too late. They have to run in a module that is
 * evaluated strictly before it, which is what `main` pointing here buys.
 */

// `crypto.getRandomValues`, used for key generation and nonces. Openfort is
// explicit that this one is imported before anything else, or the `crypto` its
// signer reaches for never loads.
import 'react-native-get-random-values';
// `TextEncoder` / `TextDecoder`, absent from Hermes and wanted by viem.
import 'fast-text-encoding';

// Only now is it safe to bring up the router.
import 'expo-router/entry';
