import { useSign7702Authorization } from '@privy-io/expo';
import type { EIP1193Provider } from '@yodlpay/react-native';
import { withYodl7702 } from '@yodlpay/react-native-eip-7702-provider';
import { isSponsoredChain, mainnetChains } from '@yodlpay/tokenlists';
import { useMemo } from 'react';

/**
 * Every chain Yodl's hosted bundler serves bills gas off-chain ("boosted"): zero
 * fees and no paymaster. The provider leaves this off by default, and without it
 * a Base payment goes through the ERC-7677 paymaster instead, which Yodl's proxy
 * refuses there ("Sponsorship policy ID is required for this API key"). Same list
 * the Yodl app passes.
 */
const BOOSTED_CHAIN_IDS = mainnetChains
  .filter(({ id }) => isSponsoredChain(id))
  .map(({ id }) => id);

export function useYodl7702Provider(provider: EIP1193Provider | null): EIP1193Provider | null {
  const { signAuthorization } = useSign7702Authorization();

  return useMemo(() => {
    if (!provider) return null;

    return withYodl7702(provider, {
      boostedChainIds: BOOSTED_CHAIN_IDS,
      nativeSendCalls: 'never',
      signAuthorization: ({ account, chainId, contractAddress, nonce }) =>
        signAuthorization({ contractAddress, chainId, nonce }, { address: account }),
    });
  }, [provider, signAuthorization]);
}
