import type { ExpoConfig } from 'expo/config';

/**
 * Nightmarket — Expo config.
 *
 * ⚠️ This app cannot run in Expo Go. `@yodlpay/react-native` renders the hosted
 * Yodl UI in `react-native-webview`, and Openfort renders a hidden WebView of its
 * own to host the embedded signer — neither is in Expo Go, which produces a crash
 * or a blank screen rather than a useful error. Build a development client:
 *
 *     pnpm --filter @nightmarket/mobile ios      # or: android
 *
 * https://docs.yodl.me/sdk/react-native#requirements
 */

/**
 * The one place a palette value is written by hand instead of imported.
 *
 * `@nightmarket/theme` ships TypeScript source with no build step, which is what
 * lets Metro hot-reload an edit to the palette straight into the running app. The
 * price is that Node cannot load it: Expo transpiles *this* file to read the
 * config, but the plain ESM resolver then handles everything it imports, and it
 * will not resolve a extensionless specifier to a `.ts` file on disk.
 *
 * One value, used for the splash background and the Android adaptive-icon
 * backdrop — both native surfaces painted before any JavaScript runs, which is
 * exactly why they can't come from the runtime palette anyway. Keep in step with
 * `dark.bg` in packages/theme/src/palette.ts, and with `INK` in
 * scripts/make-icons.py, which draws the PNGs that sit on it.
 *
 * Ink rather than a scheme-aware pair on purpose: the launch frame is the same
 * room as the viewfinder and the hosted pay surface, which are Ink in both
 * schemes. It is also the reason `dark:` below repeats the same value.
 */
const SPLASH_BG = '#1A1814';

const config: ExpoConfig = {
  name: 'Nightmarket',
  slug: 'nightmarket',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // The UI is designed dark-first, but `automatic` is deliberate: the hosted Yodl
  // UI is handed `themeMode="system"`, and pinning the app to dark while Yodl
  // follows the device is exactly the seam this demo exists to avoid.
  userInterfaceStyle: 'automatic',

  // Needed by expo-router for deep links, and by Openfort for its OAuth return leg.
  scheme: 'nightmarket',

  ios: {
    bundleIdentifier: 'me.yodl.nightmarket',
    supportsTablet: false,
    infoPlist: {
      // The Yodl hosted UI and Openfort both load over https; no cleartext needed.
      NSCameraUsageDescription:
        'Nightmarket uses the camera to scan merchant QR codes so you can pay them.',
    },
  },

  android: {
    package: 'me.yodl.nightmarket',
    adaptiveIcon: {
      backgroundColor: SPLASH_BG,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['android.permission.CAMERA'],
    predictiveBackGestureEnabled: false,
  },

  web: { favicon: './assets/favicon.png' },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    [
      'expo-camera',
      {
        cameraPermission:
          'Nightmarket uses the camera to scan merchant QR codes so you can pay them.',
        recordAudioAndroid: false,
      },
    ],
    [
      // Only ever used to read a QR code out of a picture the user chose —
      // merchant codes circulate as screenshots in the markets Yodl serves.
      // Read-only: the app never writes to the library, so that permission
      // string is left off rather than requested "just in case".
      'expo-image-picker',
      {
        photosPermission:
          'Nightmarket can read a merchant QR code out of a photo you pick, so you can pay a code someone sent you.',
        // ⚠️ `false` here does NOT mean "this plugin doesn't need it". The
        // plugin passes it to `withBlockedPermissions`, which strips the
        // permission from the merged manifest and stops *every other* package
        // from declaring it too.
        //
        // So `cameraPermission: false` does not just skip the picker's camera —
        // it deletes expo-camera's own CAMERA declaration, and the app ships
        // with no camera permission at all. Android then reports "No permissions
        // requested", `requestPermission()` can never succeed, and the scanner is
        // permanently stuck on its own permission screen.
        //
        // Only microphone is blocked, because nothing here records audio and a
        // payments app asking for the mic is the kind of thing that gets it
        // uninstalled. Camera is left alone for expo-camera to declare.
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        backgroundColor: SPLASH_BG,
        dark: { image: './assets/splash-icon.png', backgroundColor: SPLASH_BG },
        imageWidth: 180,
        resizeMode: 'contain',
      },
    ],
  ],
  // Fonts are loaded at runtime with `useFonts` in app/_layout.tsx rather than
  // embedded by the expo-font config plugin. Both bundle the .ttf locally — there
  // is no network fetch either way — but `useFonts` registers each family under
  // exactly the name the @expo-google-fonts package exports, which is the name
  // packages/theme refers to. Embedding registers them under the platform's own
  // derived name, and iOS and Android derive it differently.

  experiments: { typedRoutes: true },
};

export default config;
