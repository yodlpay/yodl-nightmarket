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
 * Three details worth keeping straight:
 *
 *  - **We do not name the email; the backend does.** Yodl passes the address the
 *    user typed on its own screen when it has one, and this hook deliberately
 *    drops it. The API authenticates the Openfort session and signs the email
 *    *it* holds for that user, so anything sent from here would either be ignored
 *    or, worse, believed. Sending nothing is the honest expression of that.
 *  - **Sign for the address Yodl proved, not the one we hold.** The request
 *    carries the wallet the hosted flow just verified with SIWE, and Yodl checks
 *    `sub` against exactly that. Using our own copy would work right up until the
 *    two disagree, and then fail as a rejected token rather than as an obvious bug.
 *  - **Every failure is a fallback.** `null`, a throw, or 30 seconds elapsed all
 *    mean the same thing to Yodl: the user verifies by code, exactly as if this
 *    were never wired up. So nothing here throws or surfaces an error.
 */

import { useUser } from '@openfort/react-native';
import type { YodlEmailAttestationFetcher } from '@yodlpay/react-native';
import { useCallback } from 'react';
import { api } from '~/api/client';
import { debug } from '~/lib/log';

export function useEmailAttestation(surface: string): YodlEmailAttestationFetcher {
  const { getAccessToken } = useUser();

  return useCallback(
    async ({ address, signal }) => {
      debug(surface, 'fetchEmailAttestation called', { provedAddress: address });

      // Fetched per call rather than held in a ref: Openfort refreshes a token
      // that is near expiry inside this call, and de-duplicates concurrent
      // refreshes behind one in-flight promise. One await is cheap next to the
      // round trip that follows it.
      const accessToken = await getAccessToken();
      if (!accessToken) {
        // No session, so the API has nobody to look an email up for. Saying so
        // here beats a round trip that can only come back a 404.
        debug(surface, 'no access token — user gets the OTP');
        return null;
      }

      const attestation = await api.emailAttestation(address, accessToken, signal);

      debug(
        surface,
        attestation
          ? 'returning attestation to Yodl'
          : 'no attestation available — user gets the OTP',
      );
      return attestation;
    },
    [getAccessToken, surface],
  );
}
