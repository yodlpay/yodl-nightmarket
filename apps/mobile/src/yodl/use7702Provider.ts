/**
 * Yodl's EIP-7702 wrapper, signing its authorizations through the embedded signer.
 *
 * The wrapper asks the integrator for this because there is no one way wallets
 * sign a 7702 authorization, and the Openfort embedded wallet offers neither of
 * the two shapes it ships helpers for: its EIP-1193 provider has no
 * `wallet_signAuthorization` method, and while `openfort-js` exports a
 * `signAuthorization`, that function wants an internal `Signer` instance no
 * public API hands out.
 *
 * What is reachable is the signer's raw-digest mode. `hashMessage: false` skips
 * the EIP-191 prefix — a 7702 authorization is signed over its own digest, and a
 * prefixed signature recovers to the wrong address — and `arrayifyMessage: true`
 * has the hex read as the bytes it stands for rather than as text. So we hash the
 * authorization with viem and sign that. viem's `SignedAuthorization` is the
 * authorization plus a split signature, which is exactly what `parseSignature`
 * returns.
 */

import { useOpenfortClient } from '@openfort/react-native';
import type { EIP1193Provider } from '@yodlpay/react-native';
import { withYodl7702 } from '@yodlpay/react-native-eip-7702-provider';
import { useMemo } from 'react';
import { type Hex, parseSignature } from 'viem';
import { hashAuthorization } from 'viem/utils';

export function useYodl7702Provider(provider: EIP1193Provider | null): EIP1193Provider | null {
  const client = useOpenfortClient();

  return useMemo(() => {
    if (!provider) return null;

    return withYodl7702(provider, {
      nativeSendCalls: 'never',
      signAuthorization: async ({ chainId, contractAddress, nonce }) => {
        const authorization = { address: contractAddress, chainId, nonce };
        const signature = await client.embeddedWallet.signMessage(
          hashAuthorization(authorization),
          { arrayifyMessage: true, hashMessage: false },
        );

        return { ...authorization, ...parseSignature(signature as Hex) };
      },
    });
  }, [provider, client]);
}
