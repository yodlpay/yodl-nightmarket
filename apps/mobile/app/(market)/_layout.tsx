/**
 * Everything under `(market)` requires a signed-in user.
 *
 * `AuthBoundary` is Privy's guard: it renders `loading` while the session is
 * being restored, `unauthenticated` when there is none, and the children when
 * there is. Putting it on the group layout rather than in each screen means a new
 * screen is protected by existing in the right folder — the failure mode of
 * per-screen guards is the screen someone forgets.
 *
 * The three hosted Yodl surfaces (pay, onboard, dashboard) are presented modally.
 * They are full-screen WebViews that own their own back affordance, and pushing
 * them onto the stack would put our header logic in a fight with theirs.
 */

import { AuthBoundary } from '@privy-io/expo';
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Screen } from '~/ui/Screen';
import { Txt } from '~/ui/Txt';
import { useColors } from '~/ui/theme';

function Loading() {
  const colors = useColors();

  // Scheme-aware, and muted rather than accented, for the same reason as the
  // gate at app/index.tsx: this is a frame the user sees before anything else.
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

function AuthError({ error }: { error: Error }) {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Txt variant="title">The market is closed</Txt>
        <Txt variant="body" tone="secondary">
          Privy couldn't restore your session.
        </Txt>
        <Txt variant="mono" tone="error">
          {error.message}
        </Txt>
      </View>
    </Screen>
  );
}

export default function MarketLayout() {
  const colors = useColors();

  return (
    <AuthBoundary
      loading={<Loading />}
      error={(error) => <AuthError error={error} />}
      unauthenticated={<Redirect href="/sign-in" />}
    >
      {/*
        The container behind the screens, and `bg` because that is what the
        screens themselves paint — activity slides in from the right over this,
        so anything else is a stripe of the wrong colour beside a moving screen.
      */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* `index` is the scanner, and it is the app. Everything else is
            somewhere you go from it and come straight back. */}
        <Stack.Screen name="index" />
        <Stack.Screen name="activity" options={{ animation: 'slide_from_right' }} />
        {/* A card sheet, not a `fullScreenModal`. Top up is a glance-and-dismiss
            surface, and full screen is spoken for by the hosted WebViews below —
            keeping the two presentations apart is what tells the user whether
            they have left the app's own chrome. */}
        <Stack.Screen name="top-up" options={{ presentation: 'modal' }} />
        {/* Pushed, like activity itself. A payment record is something you may
            want to sit with rather than glance at and flick away. */}
        <Stack.Screen
          name="payment/[chainId]/[txHash]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen name="pay" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="onboard" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="dashboard" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </AuthBoundary>
  );
}
