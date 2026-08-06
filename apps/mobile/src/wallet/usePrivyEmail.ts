/**
 * The email Privy has already verified for this user.
 *
 * They proved it with an OTP at sign-in, which is exactly the fact the Yodl
 * email attestation exists to assert — so it is worth having on hand at the
 * moment the hosted signup flow asks for one.
 *
 * Only a *verified* address is returned. An unverified one would be a claim the
 * user typed, and signing a token that says "we verified this" over a claim we
 * did not verify is the whole failure mode attestation is supposed to prevent.
 */

import { usePrivy } from '@privy-io/expo';
import { useEffect } from 'react';
import { debug } from '~/lib/log';

export function usePrivyEmail(): string | null {
  const { user } = usePrivy();

  const account = user?.linked_accounts.find((linked) => linked.type === 'email');
  const email = account?.address ?? null;

  // Logged from an effect keyed on the value, not inline. Inline it fired on
  // every render of every screen holding this hook — five identical lines while
  // the payment surface settled — which buries the lines that matter.
  useEffect(() => {
    if (email) debug('privy-email', 'resolved', { email });
    // Not a fault: the user may have signed in by SMS, passkey or OAuth. It just
    // means there is nothing we can honestly attest, and the OTP stands.
    else debug('privy-email', 'no verified email linked — attestation will decline');
  }, [email]);

  return email;
}
