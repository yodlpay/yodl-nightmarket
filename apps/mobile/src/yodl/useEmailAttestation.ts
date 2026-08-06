/**
 * One email-attestation fetcher, for every hosted surface.
 *
 * This used to live inline in the signup screen, because the SDK only accepted
 * it there. That turned out to be the wrong shape: a wallet with no Yodl account
 * is asked to register **inside the payment flow** too, and that registration
 * could never take the fast path — the prop had nowhere to go.
 *
 * With `fetchEmailAttestation` on `YodlComponentProps`, payment and dashboard
 * accept it as well, so the sensible thing is one fetcher shared by all three
 * rather than three copies drifting apart.
 *
 * Two details worth keeping straight:
 *
 *  - **Sign for the address Yodl proved, not the one we hold.** The request
 *    carries the wallet the hosted flow just verified with SIWE, and Yodl checks
 *    `sub` against exactly that. Using our own copy would work right up until the
 *    two disagree, and then fail as a rejected token rather than as an obvious bug.
 *  - **Every failure is a fallback.** `null`, a throw, or 30 seconds elapsed all
 *    mean the same thing to Yodl: the user verifies by code, exactly as if this
 *    were never wired up. So nothing here throws or surfaces an error.
 */

import type { YodlEmailAttestationFetcher } from '@yodlpay/react-native';
import { useCallback } from 'react';
import { api } from '~/api/client';
import { debug } from '~/lib/log';
import { usePrivyEmail } from '~/wallet/usePrivyEmail';

export function useEmailAttestation(surface: string): YodlEmailAttestationFetcher {
  const privyEmail = usePrivyEmail();

  return useCallback(
    async ({ address, email, signal }) => {
      debug(surface, 'fetchEmailAttestation called', {
        provedAddress: address,
        emailFromYodl: email ?? '(not collected yet)',
        fallbackFromPrivy: privyEmail ?? '(none)',
      });

      // `email` is what the user typed on Yodl's screen, and the docs note it is
      // only present "when it has been collected" — this can fire before that.
      // Falling back to the address Privy already verified means there is
      // something to assert either way. If the two differ Yodl rejects the token
      // and the user takes the OTP, which does not burn the jti.
      const attestation = await api.emailAttestation(
        address,
        email ?? privyEmail ?? undefined,
        signal,
      );

      debug(
        surface,
        attestation
          ? 'returning attestation to Yodl'
          : 'no attestation available — user gets the OTP',
      );
      return attestation;
    },
    [privyEmail, surface],
  );
}
