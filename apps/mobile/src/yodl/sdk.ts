/**
 * The Yodl SDK instance, created once for the whole app.
 *
 * `createYodlSdk` is a config-once factory, not a per-screen thing — hence a module
 * constant rather than a hook. It holds no wallet state; the live account and
 * chain go to `<YodlProvider>` on every render.
 *
 * https://docs.yodl.me/sdk/react-native/quickstart
 */

import { createYodlSdk } from '@yodlpay/react-native';
import { getTokenBySymbol } from '@yodlpay/tokenlists';
import { env } from '~/env';
import { BALANCE_CHAIN_ID } from '~/wallet/useBalance';

/**
 * USDC on Base, and nothing else. The hosted UI shows and pays from `tokenlist`
 * alone, and `supportedChainIds` is every chain it may ask the wallet to switch
 * to. Both are `BALANCE_CHAIN_ID` — the chain `useBalance` counts and the top-up
 * screen tells people to send USDC on — so "Spendable" is exactly what a payment
 * can draw from. A payment paying out of a ledger that figure ignores is the same
 * drift the top-up screen imports that constant to prevent.
 *
 * Narrower than `SUPPORTED_CHAINS` in `@nightmarket/shared`, which `_layout.tsx`
 * hands Privy, and that direction is the safe one: every switch Yodl can request
 * is one the wallet will make. Wider would be a switch the wallet refuses,
 * mid-payment.
 *
 * `getTokenBySymbol` resolves to Circle's native USDC rather than a bridged
 * variant, and throws for a chain the list carries no USDC on — moving the
 * balance chain to one fails at startup rather than offering nothing to pay with.
 */
export const sdk = createYodlSdk({
  integrationAddress: env.yodlIntegrationAddress,
  supportedChainIds: [BALANCE_CHAIN_ID],
  tokenlist: [getTokenBySymbol('USDC', BALANCE_CHAIN_ID)],
});
