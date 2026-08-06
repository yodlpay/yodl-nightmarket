/**
 * Yodl's own account view, hosted.
 *
 * This is the same wallet and the same palette as everything else in the app —
 * the only difference is who renders it. Worth having in the demo precisely
 * because it is the screen where a badly-shared theme would be most obvious.
 */

import { space } from '@nightmarket/theme';
import { YodlDashboard } from '@yodlpay/react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '~/ui/Button';
import { Gate } from '~/ui/Gate';
import { IconGrid } from '~/ui/Icon';
import { Txt } from '~/ui/Txt';
import { useColors } from '~/ui/theme';
import { useEmailAttestation } from '~/yodl/useEmailAttestation';
import { YodlHost } from '~/yodl/YodlHost';

export default function Dashboard() {
  const [error, setError] = useState<Error | null>(null);
  const insets = useSafeAreaInsets();

  if (error) return <DashboardUnavailable error={error} />;

  return (
    <View style={styles.fill}>
      <YodlHost>{() => <DashboardSurface onError={setError} />}</YodlHost>
      <View style={[styles.dismiss, { bottom: insets.bottom + space.lg }]} pointerEvents="box-none">
        <Button label="Done" variant="quiet" onPress={() => router.replace('/(market)')} />
      </View>
    </View>
  );
}

/** The same `<Gate>` every other dead end in the app uses. */
function DashboardUnavailable({ error }: { error: Error }) {
  const colors = useColors();

  return (
    <Gate
      icon={<IconGrid size={26} color={colors.textSecondary} />}
      eyebrow="Yodl dashboard"
      title="Dashboard unavailable"
      body="This surface is hosted by Yodl and it didn't load. Nothing about your wallet or your payments has changed — the feed in Activity is read from our own backend and is unaffected."
      action={<Button label="Back to the market" onPress={() => router.replace('/(market)')} />}
      note={
        <Txt variant="mono" tone="error">
          {error.message}
        </Txt>
      }
    />
  );
}

/**
 * The dashboard can prompt an accountless wallet to register too, so it gets the
 * same fetcher. Before `fetchEmailAttestation` moved onto `YodlComponentProps`
 * this surface had no way to accept one.
 */
function DashboardSurface({ onError }: { onError: (error: Error) => void }) {
  const fetchEmailAttestation = useEmailAttestation('dashboard');
  return (
    <YodlDashboard
      style={styles.fill}
      fetchEmailAttestation={fetchEmailAttestation}
      onError={onError}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // The hosted dashboard fills the screen and has no exit of its own, so the
  // modal needs one. Floated rather than in a header bar: a header would eat
  // vertical space from a WebView that is already scrolling its own content.
  // `bottom` is applied inline from the safe-area inset. A fixed value clears
  // the gesture bar on some devices and sits under it on others.
  dismiss: { position: 'absolute', left: space.xl, right: space.xl },
});
