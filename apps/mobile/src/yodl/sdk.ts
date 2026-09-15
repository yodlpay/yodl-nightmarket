/**
 * The Yodl SDK instance, created once for the whole app.
 *
 * `createSdk` is a config-once factory, not a per-screen thing — hence a module
 * constant rather than a hook. It holds no wallet state; the live account and
 * chain go to `<YodlProvider>` on every render.
 *
 * https://docs.yodl.me/sdk/react-native/quickstart
 */

import { SUPPORTED_CHAIN_IDS } from '@nightmarket/shared';
import { createSdk } from '@yodlpay/react-native';
import { env } from '~/env';

/**
 * The ids come from `SUPPORTED_CHAINS` in `@nightmarket/shared`, which is viem's
 * chain records and is also what `_layout.tsx` hands Openfort. This used to be a
 * literal `[1, 8453, 42161]` with a comment asking the reader to keep it in sync
 * with the wallet's list — the two disagreeing is a switch request the wallet
 * refuses, mid-payment, and a comment is a poor way to prevent that.
 */
export const sdk = createSdk({
  integrationAddress: env.yodlIntegrationAddress,
  supportedChainIds: [...SUPPORTED_CHAIN_IDS],
});
