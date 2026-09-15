/**
 * The gate. Nothing renders here — it decides where the user actually goes.
 *
 * Openfort restores its session asynchronously, so the honest answer for the
 * first few hundred milliseconds is "don't know yet". Redirecting on
 * `user === null` before `isReady` bounces a signed-in user to the sign-in screen
 * and then back, which is both a flash and, on a slow device, a chance to tap the
 * wrong thing.
 */

import { useOpenfort, useUser } from '@openfort/react-native';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useColors } from '~/ui/theme';

export default function Index() {
  const { isReady } = useOpenfort();
  const { user } = useUser();
  const colors = useColors();

  if (!isReady) {
    // This is the first frame of a cold launch, so it has to be in the device's
    // scheme — booting into Ink and snapping to Paper a moment later shows the
    // wrong theme first. The spinner is `textMuted` rather than the accent:
    // Ultramarine means "this money has settled" and nothing has settled here.
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return <Redirect href={user ? '/(market)' : '/sign-in'} />;
}
