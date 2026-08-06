/**
 * The four values this app cannot invent.
 *
 * `EXPO_PUBLIC_*` is inlined into the bundle at build time, which is fine for all
 * four — a Privy app id and a Yodl integration address are public identifiers,
 * not credentials. The one secret in this system, the Yodl API secret, lives only
 * in `apps/api`. If you ever find yourself wanting it here, that's the signal to
 * add an endpoint to the API instead.
 *
 * Nothing here throws. An earlier version did, on the theory that failing loudly
 * beats failing mysteriously — but a module-level throw in an Expo app is a red
 * box before the first frame, which tells you *that* something is wrong and
 * nothing about *what*. Reporting the missing names lets the root layout render a
 * screen that says which variable is empty and where to get it, which is the same
 * information delivered somewhere a person can read it.
 */

const read = (value: string | undefined): string => (value ?? '').trim();

/** Values the app can start without, even if it can't do much. */
export const env = {
  privyAppId: read(process.env.EXPO_PUBLIC_PRIVY_APP_ID),
  privyClientId: read(process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID),

  /**
   * Falls back to the zero address so `createSdk` — which requires a non-empty
   * `0x` address — still constructs. A payment made under it is attributed to
   * nobody, which is why `missingEnv` still reports it.
   */
  yodlIntegrationAddress: (read(process.env.EXPO_PUBLIC_YODL_INTEGRATION_ADDRESS) ||
    '0x0000000000000000000000000000000000000000') as `0x${string}`,

  apiUrl: (read(process.env.EXPO_PUBLIC_API_URL) || 'http://localhost:8787').replace(/\/$/, ''),
} as const;

export interface MissingVariable {
  name: string;
  why: string;
  where: string;
}

/**
 * Everything that must be filled in before the app can work, in the order a
 * person should deal with it.
 */
export const missingEnv: MissingVariable[] = [
  ...(env.privyAppId
    ? []
    : [
        {
          name: 'EXPO_PUBLIC_PRIVY_APP_ID',
          why: 'Without it there is no sign-in, and therefore no wallet to pay with.',
          where: 'dashboard.privy.io → your app → App ID',
        },
      ]),
  ...(env.privyClientId
    ? []
    : [
        {
          name: 'EXPO_PUBLIC_PRIVY_CLIENT_ID',
          why: 'A mobile app needs this as well as the app id — it is what authorises a non-web platform to call Privy.',
          where: 'dashboard.privy.io → your app → Clients',
        },
      ]),
  ...(env.yodlIntegrationAddress === '0x0000000000000000000000000000000000000000'
    ? [
        {
          name: 'EXPO_PUBLIC_YODL_INTEGRATION_ADDRESS',
          why: 'Payments would be attributed to nobody, and your backend would reject every webhook as addressed elsewhere.',
          where: 'docs.yodl.me/integrations/integration-address',
        },
      ]
    : []),
];

/** True when the app has everything it needs to actually take a payment. */
export const isConfigured = missingEnv.length === 0;
