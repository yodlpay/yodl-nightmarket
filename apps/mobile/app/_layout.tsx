/**
 * Root layout: fonts, Privy, safe area, and the splash screen that waits for them.
 *
 * Order matters. `PrivyProvider` wraps everything because any screen may ask for
 * the user or the wallet, and the splash is held until the fonts resolve so the
 * first frame the user sees is already in Instrument Sans. A payment app that
 * renders one frame in the system font looks broken in a way that is hard to
 * un-see.
 */

import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  useFonts,
} from '@expo-google-fonts/instrument-sans';
import { SUPPORTED_CHAINS } from '@nightmarket/shared';
import { palette } from '@nightmarket/theme';
import { PrivyProvider } from '@privy-io/expo';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '~/api/query';
import { env, isConfigured, missingEnv } from '~/env';
import { SetupNeeded } from '~/ui/SetupNeeded';
import { useScheme } from '~/ui/theme';

// Hold the native splash until fonts are ready. `catch` because this rejects
// harmlessly if the splash has already auto-hidden (fast reload, dev client).
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Light is the designed default and the fallback, so neither of the two things
  // this layout paints may be pinned to one scheme. Both used to be, invisibly,
  // because the old design was dark-first.
  const scheme = useScheme();
  const colors = palette[scheme];

  // Three weights of one family, and mono for the two jobs that are literally
  // machine output. No 700 and no italics: the display face and the bold weights
  // that used to carry the hero are gone, because a display face at hero size is
  // the loudest single thing dating the old design. Bricolage and Space Grotesk
  // stay in package.json, unused — removing a font package is a prebuild.
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  useEffect(() => {
    // Hide on error too. A missing font is a downgrade to the system face; a
    // splash screen that never lifts is a broken app.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/*
        The app runs edge-to-edge, which on Android means the window no longer
        resizes when the keyboard opens — `adjustResize` is a no-op, and a form
        near the bottom of the screen simply disappears behind the keys.
        `KeyboardProvider` is what feeds the real keyboard height to the views
        that need to move out of the way. It has to sit above everything that
        might contain a text field.
      */}
      <KeyboardProvider>
        <SafeAreaProvider>
          {/*
            The *content* colour: dark glyphs on Paper, light glyphs on Ink —
            i.e. `auto`, written out so it follows the same null-scheme-means-
            light rule as the rest of the app. Pinning this to `light` (as the
            dark-first design did) leaves the clock and battery near-white on a
            near-white ground on every screen in the default scheme.

            The scanner mounts its own `<StatusBar style="light" />` while it is
            on screen — it is Ink over the camera in both schemes — and React
            Native's props stack restores this one on unmount.
          */}
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

          {/*
            Mounting PrivyProvider with an empty appId gets you an opaque failure
            deep in the SDK, so an unconfigured app gets a screen naming the
            variable instead.
          */}
          {isConfigured ? (
            /*
              Every read in the app — the feed, a payment, the on-chain balance —
              goes through this client, so it sits above the router rather than
              inside a screen: a provider mounted per screen would give each one
              its own cache, and the whole point is that the feed and the detail
              screen are looking at the same payment.

              Outside `PrivyProvider` on purpose: nothing in the client reads
              Privy's context — the screens pass the wallet address in as an
              argument — and the cache is dropped explicitly at sign-out, where
              the session ends, rather than by unmounting a provider.
            */
            <QueryProvider>
              <PrivyProvider
                appId={env.privyAppId}
                clientId={env.privyClientId}
                supportedChains={[...SUPPORTED_CHAINS]}
                /*
                  The wallet is provisioned as part of logging in, which is why
                  no screen in this app asks anyone to create one. Privy's
                  default here is `off`, and the cost of leaving it there was a
                  full-screen gate with a "Create my wallet" button on it — a
                  step with no decision in it, in an app whose premise is that
                  there is nothing to set up.

                  `users-without-wallets` rather than `all-users`: the latter
                  mints an additional wallet for someone who already has one.
                  Every login path this app can take carries the setting into the
                  SDK, so email codes today and anything added later are covered.
                */
                config={{ embedded: { ethereum: { createOnLogin: 'users-without-wallets' } } }}
              >
                {/*
                  `bgDeep` is the token's one job: what sits behind the root Stack
                  and under a scroll bounce. Every transition here is animated, so
                  a hardcoded value shows as a panel of the wrong scheme beside
                  and behind the moving screen on every push.
                */}
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bgDeep },
                    animation: 'fade',
                  }}
                />
              </PrivyProvider>
            </QueryProvider>
          ) : (
            <SetupNeeded missing={missingEnv} />
          )}
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
