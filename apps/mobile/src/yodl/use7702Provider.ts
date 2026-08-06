import { useSign7702Authorization } from '@privy-io/expo';
import type { EIP1193Provider } from '@yodlpay/react-native';
import { withYodl7702 } from '@yodlpay/react-native-eip-7702-provider';
import { useMemo } from 'react';

export function useYodl7702Provider(provider: EIP1193Provider | null): EIP1193Provider | null {
  const { signAuthorization } = useSign7702Authorization();

  return useMemo(() => {
    if (!provider) return null;

    return withYodl7702(provider, {
      nativeSendCalls: 'never',
      signAuthorization: ({ account, chainId, contractAddress, nonce }) =>
        signAuthorization({ contractAddress, chainId, nonce }, { address: account }),
    });
  }, [provider, signAuthorization]);
}
