/**
 * The payment screen. Yodl owns it up to the point a transaction exists.
 *
 * `onTransactionSent` is the handover: we seed the record, leave for our own
 * status screen, and post the intent behind us. That screen polls the backend
 * record until the payment settles. So the hosted UI covers choosing and signing,
 * and everything after it — waiting, settling, the receipt — is ours.
 *
 * The record is what we render, not the SDK's bridged status. It is the same data
 * either way, but the backend's copy is signed (or pulled from Yodl's API), it
 * survives the app being backgrounded mid-payment, and it is still there when the
 * user opens the payment again a day later.
 *
 * The `qrData` guard stays load-bearing: `<YodlPayment>` renders *nothing* for a QR
 * it doesn't recognise, so an unguarded render is a blank screen, not an error.
 */

import { isPaymentQr, YodlPayment } from '@yodlpay/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '~/api/client';
import { invalidateWalletData, seedPendingPayment } from '~/api/hooks';
import { debug, warn } from '~/lib/log';
import { Button } from '~/ui/Button';
import { Gate } from '~/ui/Gate';
import { IconFinder } from '~/ui/Icon';
import { Txt } from '~/ui/Txt';
import { useColors } from '~/ui/theme';
import { useEmailAttestation } from '~/yodl/useEmailAttestation';
import { YodlHost } from '~/yodl/YodlHost';

export default function Pay() {
  const { qr } = useLocalSearchParams<{ qr?: string }>();
  const [error, setError] = useState<Error | null>(null);

  // The scanner already checked this. Checking again is not redundant: this
  // route is reachable by deep link, and a bad `qr` param would otherwise render
  // an empty black screen with no explanation.
  if (!qr || !isPaymentQr(qr)) return <NotAPaymentCode />;
  if (error) return <PaymentError error={error} />;

  return (
    <YodlHost>
      {({ address, chainId }) => (
        <PaymentSurface
          qr={qr}
          address={address}
          chainId={chainId}
          onFatal={(cause) => {
            // Logged as well as rendered, and kept in release builds. An SDK
            // error here can be kilobytes of ABI-encoded calldata with the part
            // that names the cause at the very end, which is readable in
            // `adb logcat | grep 'nm:'` and not on a phone screen.
            warn('pay', 'payment stopped', cause);
            setError(cause);
          }}
        />
      )}
    </YodlHost>
  );
}

function PaymentSurface({
  qr,
  address,
  chainId,
  onFatal,
}: {
  qr: string;
  address: string;
  chainId: number;
  onFatal: (error: Error) => void;
}) {
  const fetchEmailAttestation = useEmailAttestation('pay');

  const handleTransactionSent = useCallback(
    (txHash: string) => {
      // The SDK hands us the hash before it forwards the RPC answer to the page,
      // so this callback runs while Yodl is still on the confirming screen. We
      // used to spend that lead — and up to the API client's 10s timeout — on a
      // POST, which is why the hosted UI was seen to change before ours did.
      //
      // Seeding is what makes leaving immediately safe. The status screen reads
      // the record by identity, and now the record is there to read.
      seedPendingPayment({ chainId, txHash, wallet: address });

      router.replace({
        pathname: '/(market)/payment/[chainId]/[txHash]',
        // Not read by the screen. It tells the layout this arrival replaced a
        // full-screen modal, so the presentation should match rather than
        // dismiss one thing while pushing another.
        params: { chainId, txHash, from: 'pay' },
      });

      // Fire and forget, and the failure is still swallowed: the transaction is
      // in flight either way, and the only consequence of a lost intent is that
      // the delivery lands as `unmatched`. Neither the promise nor the query
      // client belongs to this screen, so both outlive the navigation above.
      void api
        .recordIntent({ chainId, txHash, wallet: address })
        // A payment now exists that the feed has never heard of. This is one of
        // the two moments the app knows the server changed, and saying so here is
        // what replaced refetching every screen whenever it came back into view.
        .then(invalidateWalletData)
        .catch((cause) => warn('pay', 'intent not recorded', cause));
    },
    [address, chainId],
  );

  return (
    <View style={styles.fill}>
      <YodlPayment
        qrData={qr}
        style={styles.fill}
        // A wallet with no Yodl account gets asked to register right here, in the
        // middle of paying — which is the moment an OTP hurts most, since there
        // is a merchant waiting. Supplying the fetcher on this surface is what
        // makes that registration able to take the fast path at all.
        fetchEmailAttestation={fetchEmailAttestation}
        onTransactionSent={handleTransactionSent}
        // Log only. `onTransactionSent` has already moved us to our own status
        // screen, so anything after `submitted` arrives on a surface the user has
        // left — and the record, not a bridged status string, is what we render.
        onPaymentDetails={(details) => debug('pay', `payment status → ${details.status}`)}
        onError={(cause) => onFatal(cause)}
      />
    </View>
  );
}

/**
 * Both fallbacks are `<Gate>`s, which is the same shape the camera and wallet
 * gates use: copy pushed to the top of the fold, the way out in the thumb arc.
 * A hosted surface that failed is a dead end like any other, and it would be odd
 * for the app to have a second error layout just because the thing that stopped
 * was a WebView.
 */
function NotAPaymentCode() {
  const colors = useColors();

  return (
    <Gate
      icon={<IconFinder size={26} color={colors.textSecondary} />}
      eyebrow="Nothing to pay"
      title="That isn't a Yodl code"
      body="Yodl reads the QR standards merchants already print in Brazil, Argentina, Vietnam and the Philippines. This one isn't among them."
      action={<Button label="Back to the scanner" onPress={() => router.replace('/(market)')} />}
    />
  );
}

function PaymentError({ error }: { error: Error }) {
  const colors = useColors();

  return (
    <Gate
      icon={<IconFinder size={26} color={colors.textSecondary} />}
      eyebrow="Payment"
      title="The payment stopped"
      body="Nothing was charged unless you saw a confirmation. If a transaction was sent, it will appear in your activity once Yodl indexes it."
      action={
        <>
          <Button label="Back to the scanner" onPress={() => router.replace('/(market)')} />
          <Button
            label="See my activity"
            variant="quiet"
            onPress={() => router.replace('/(market)/activity')}
          />
        </>
      }
      // Mono, because this string is machine output and not a sentence we wrote.
      // Under the actions rather than in the body: the user's way out should not
      // have to be read past an SDK error to be found.
      note={
        <Txt variant="mono" tone="error">
          {error.message}
        </Txt>
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
