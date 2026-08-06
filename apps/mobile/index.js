/**
 * The app's real entry point: polyfills first, then Expo Router.
 *
 * Hermes is a JS engine, not a browser. It has no `crypto`, no `TextEncoder`, and
 * none of the stream/buffer furniture that Ethereum libraries assume. Privy's
 * dependency graph reaches for all of it — `@noble/hashes` opens with
 * `'crypto' in globalThis ? globalThis.crypto : undefined`, and viem and the
 * ethers-derived code want the rest.
 *
 * Without these the app dies before rendering, with `ReferenceError: Property
 * 'crypto' doesn't exist` repeated once per module, followed by a pile of
 * "Route is missing the required default export" warnings. Those warnings are a
 * red herring: the routes export fine, they just never finished evaluating,
 * because the polyfill was missing underneath them.
 *
 * Ordering is the whole point of this file. `expo-router/entry` pulls in the
 * route tree, which pulls in Privy, which touches `crypto` at module scope — so
 * the polyfills cannot live in `app/_layout.tsx`, which is itself part of that
 * graph and therefore too late. They have to run in a module that is evaluated
 * strictly before it, which is what `main` pointing here buys.
 *
 * https://github.com/privy-io/expo-starter — Privy's own README lists these three.
 */

// `crypto.getRandomValues`, used for key generation and nonces.
import 'react-native-get-random-values';
// `TextEncoder` / `TextDecoder`, absent from Hermes.
import 'fast-text-encoding';
// Buffer and the assorted globals the ethers-derived code paths expect.
import '@ethersproject/shims';

// Only now is it safe to bring up the router.
import 'expo-router/entry';
