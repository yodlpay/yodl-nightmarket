/**
 * Yodl signup — SIWE, email capture, verification. All of it hosted.
 *
 * We render one component and wait for a callback. The SDK exposes no account
 * details from the flow: `onSignedUp` means "they finished", and nothing more. If
 * an app needs to remember that, it persists it itself — there is no API to ask
 * the SDK afterwards.
 *
 * `fetchEmailAttestation` is the interesting prop. Our backend has already
 * verified this user's email (Privy's OTP is how they signed in), so it can mint
 * a short-lived JWT asserting that and the user skips Yodl's own OTP. Every
 * failure mode of that path — a `null`, a throw, a timeout — is a silent fallback
 * to the normal code entry, never an error. Which is why the client returns
 * `null` on anything unexpected rather than surfacing it.
 *
 * Note that attestation is granted per integration and is off until Yodl enables
 * it, so on a fresh integration this correctly does nothing at all.
 */

import { YodlSignup } from '@yodlpay/react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { debug, warn } from '~/lib/log';
import { Button } from '~/ui/Button';
import { Gate } from '~/ui/Gate';
import { IconAccount } from '~/ui/Icon';
import { Txt } from '~/ui/Txt';
import { useColors } from '~/ui/theme';
import { useEmailAttestation } from '~/yodl/useEmailAttestation';
import { useYodlAccount } from '~/yodl/useYodlAccount';
import { YodlHost } from '~/yodl/YodlHost';

export default function Onboard() {
  const [error, setError] = useState<Error | null>(null);

  if (error) return <SignupStopped error={error} />;

  return (
    <YodlHost>{({ address }) => <SignupSurface address={address} onError={setError} />}</YodlHost>
  );
}

/**
 * The same `<Gate>` the camera and wallet gates use — bottom-anchored copy, the
 * single way out in the thumb arc. Signup failing is not a worse kind of dead
 * end than having no camera permission, and it should not get its own layout.
 */
function SignupStopped({ error }: { error: Error }) {
  const colors = useColors();

  return (
    <Gate
      icon={<IconAccount size={26} color={colors.textSecondary} />}
      eyebrow="Yodl account"
      title="Signup stopped"
      body="You can pay without a Yodl account — this step only unlocks the dashboard and payment history on Yodl's side."
      action={<Button label="Back to the market" onPress={() => router.replace('/(market)')} />}
      note={
        <Txt variant="mono" tone="error">
          {error.message}
        </Txt>
      }
    />
  );
}

function SignupSurface({ address, onError }: { address: string; onError: (error: Error) => void }) {
  const fetchEmailAttestation = useEmailAttestation('signup');
  const { markSignedUp } = useYodlAccount(address);

  const done = () => {
    // The SDK has no API to ask "does this wallet have an account?" later, so
    // this write is the only record that survives the screen.
    markSignedUp();
    router.replace('/(market)');
  };

  debug('signup', 'mounted', { address });

  return (
    <YodlSignup
      style={styles.fill}
      // The status machine is the most informative thing on this screen. If
      // `fetchEmailAttestation` never logs, watch for `signing_up` here: the
      // hosted flow only asks for a token once it is actually creating the
      // account, so a flow that stops before that never calls us at all.
      onStatusChange={(status) => {
        debug('signup', `status → ${status}`);
        // `signed_up` also fires for a wallet that already had an account, which
        // `onSignedUp` does not — so this is what stops a returning user being
        // offered registration a second time.
        if (status === 'signed_up') markSignedUp();
      }}
      onSignedUp={() => {
        debug('signup', 'onSignedUp — registration completed');
        done();
      }}
      onDismiss={() => {
        debug('signup', 'dismissed');
        router.replace('/(market)');
      }}
      onError={(cause) => {
        warn('signup', 'error from hosted flow', cause.message);
        onError(cause);
      }}
      fetchEmailAttestation={fetchEmailAttestation}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
