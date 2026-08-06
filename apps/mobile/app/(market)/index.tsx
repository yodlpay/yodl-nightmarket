/**
 * The scanner. This is the app.
 *
 * Opening straight onto a live viewfinder is the whole design: Nightmarket is a
 * thing you hold up to a stall's printed code, and every tap between launching it
 * and the camera being live is a tap spent in front of someone waiting to be paid.
 * There is no home screen behind this — the feed, the wallet and Yodl's own
 * surfaces all hang off the bar at the bottom.
 *
 * `isPaymentQr` is the important line in this file. It is a pure helper — no SDK
 * instance, no provider — so it can guard *before* anything is mounted, and the
 * Yodl docs call skipping it "the most common cause of a blank payment screen":
 * `<YodlPayment>` renders nothing for a QR it doesn't recognise rather than
 * erroring, so an unguarded push lands the user on an empty screen with no way to
 * tell whether it's broken or still loading.
 *
 * Rejected codes are deliberately *not* silent. A camera that quietly ignores a QR
 * is indistinguishable from one that isn't focusing, and a user will stand there
 * re-aiming at a code that was never going to work.
 *
 * ── On the paint ──────────────────────────────────────────────────────────────
 *
 * This is the one screen in the app that ignores `useColorScheme()` entirely and
 * hardcodes colour, because its ground is a live video feed and a palette token
 * assumes a known background. It is Ink over camera in *both* schemes, and that
 * is deliberate: aiming at a code and paying for it are the two moments the phone
 * is raised at a stall, and the hosted Yodl surface behind `/pay` is Ink too. In
 * dark mode the handoff is seamless; in light mode this is the app's single
 * designed luminance boundary, crossed on the way in and on the way back.
 *
 * The camera is dimmed everywhere except one square window, so the frame is drawn
 * by the absence of the scrim rather than by an outline. The four marks in its
 * corners are QR finder patterns — the 7:5:3 concentric squares every code
 * carries — so the viewfinder shows the shape it is hunting for and the screen is
 * unmistakably a QR scanner at a glance rather than a generic camera.
 *
 * The two gates below are *not* the scanner. They are ordinary screens on `bg`
 * and they follow the device's scheme like everything else.
 *
 * ── What this redesign changed ────────────────────────────────────────────────
 *
 * Four things, all sourced from a research pass over comparable payments
 * scanners (`docs/design-research/2026-08-05-scanner-redesign.md`):
 *
 * The caption below the window is now permanent rather than shown only on a
 * rejection. Every comparable payments scanner researched names the kind of
 * code it accepts — "Scan a ShopBack QR code to pay", "Send crypto and connect
 * to dapps by scanning a QR code" — and none of them describe the gesture of
 * holding the phone up. `isPaymentQr` rejects most of what this screen's camera
 * sees, so saying which codes work is worth more here than on a scanner that
 * reads anything: it is the one line that teaches the user before the first
 * rejection does, not after. It lives in the same chip the rejection already
 * used, so a rejection swaps the sentence in place rather than inserting a
 * second one above it — one slot, two states, nothing else on screen moves.
 *
 * The photo control moved off the pill under the window and into a 44pt tile
 * beside the torch. Every reference that offers gallery import draws it as an
 * icon of the torch's own weight, never a labelled button — both answer "where
 * does the camera's image come from", neither is the primary action, and the
 * pill was spending the screen's one `radius.full` allowance on something that
 * is not a CTA. That also frees the slot under the window for the caption.
 *
 * The four finder marks now carry a dark halo — a heavier ring drawn beneath
 * the white one. They are the one white geometry that sits *inside* the window,
 * which is the one region of the screen the scrim does not dim, so over a
 * bright subject — a pale sign, a white shirt — the white ring alone can lose
 * contrast entirely. The halo is opt-in on `IconFinder`, so nothing else that
 * draws the mark is affected.
 *
 * The wallet strip's right column shows the spendable balance now, not the word
 * "Activity". The strip already answers *which* wallet is paying; the balance
 * answers whether it *can* — the more useful fact to know before committing to
 * a code at a stall. The chevron still says the row goes somewhere, so the
 * destination and the identity half are unchanged; only the second column's
 * content is.
 */

import { truncateAddress } from '@nightmarket/shared';
import { radius, space } from '@nightmarket/theme';
import { isPaymentQr } from '@yodlpay/react-native';
import {
  CameraView,
  type PermissionResponse,
  scanFromURLAsync,
  useCameraPermissions,
} from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button } from '~/ui/Button';
import { Gate } from '~/ui/Gate';
import { IconChevron, IconFinder, IconPhoto, IconTorch } from '~/ui/Icon';
import { Screen } from '~/ui/Screen';
import { Txt } from '~/ui/Txt';
import { useColors } from '~/ui/theme';
import { useBalance } from '~/wallet/useBalance';
import { useWallet } from '~/wallet/useWallet';

/** How long a rejection stays on screen before the scanner re-arms. */
const REJECT_COOLDOWN_MS = 1_800;

/**
 * Camera chrome, hardcoded — the one place in the app where that is correct.
 *
 * `scrim` dims the feed everywhere but the window. `chrome` fills the controls
 * that float on the clear part of it. `mark` and `dim` are the two text weights,
 * and `reject` is the palette's dark-mode `error` written out, because this
 * screen is Ink in both schemes and so always wants the dark-ground value.
 * `halo` and `rejectWash` belong to the same block for the same reason: an
 * under-stroke for the finder marks and a translucent fill for the window, both
 * needed because their ground is live video rather than a palette surface.
 */
const SCRIM = 'rgba(0,0,0,0.55)';
const CHROME = 'rgba(0,0,0,0.62)';
const MARK = 'rgba(255,255,255,0.92)';
const DIM = 'rgba(255,255,255,0.72)';
const REJECT = '#FF8A75';
/** The glyph inside a lit torch: Ink, so the tile reads as a lamp that is on. */
const ON_LIGHT = '#1A1814';
/** Under-stroke behind each finder mark — see `IconFinder`'s `halo` prop. */
const HALO = 'rgba(0,0,0,0.45)';
/** `REJECT` at 18% — the window's fill for the rejection cooldown. */
const REJECT_WASH = 'rgba(255,138,117,0.18)';

/**
 * The dimmed band, as one path: the full width, minus a rounded square window.
 *
 * Two subpaths, wound the same way and filled `evenodd`, so the second is
 * subtracted from the first. The window is as tall as the band, so its top and
 * bottom edges land on the band's own — the corners are the only thing this
 * draws that a pair of flanking rectangles could not.
 */
function scrimWithWindow(width: number, size: number, r: number): string {
  const left = (width - size) / 2;
  const right = left + size;

  return [
    `M0 0 H${width} V${size} H0 Z`,
    `M${left + r} 0`,
    `H${right - r}`,
    `A${r} ${r} 0 0 1 ${right} ${r}`,
    `V${size - r}`,
    `A${r} ${r} 0 0 1 ${right - r} ${size}`,
    `H${left + r}`,
    `A${r} ${r} 0 0 1 ${left} ${size - r}`,
    `V${r}`,
    `A${r} ${r} 0 0 1 ${left + r} 0`,
    'Z',
  ].join(' ');
}

/** The finder mark drawn in each corner of the window. */
const FINDER = 28;
/** How far the marks sit inside the window — a QR's quiet zone, roughly. */
const FINDER_INSET = space.md;

export default function Scanner() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wallet = useWallet();
  const balance = useBalance(wallet.provider, wallet.address, wallet.chainId);
  // The third value is easy to miss and matters: `requestPermission` can only
  // ever show the OS dialog once Android is still willing to ask. `getPermission`
  // re-reads the current state, which is the only way to notice a change the user
  // made in Settings while we were backgrounded.
  const [permission, requestPermission, getPermission] = useCameraPermissions();

  const [torch, setTorch] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [checkingImage, setCheckingImage] = useState(false);

  /**
   * Expo Router keeps this screen mounted underneath whatever is pushed on top of
   * it, so without this the camera would keep running behind the payment WebView
   * — draining the battery and holding the OS camera indicator on while the user
   * is entering an amount. Unmounting on blur is unambiguous in a way that
   * pausing is not.
   */
  const [focused, setFocused] = useState(false);

  /**
   * The camera fires `onBarcodeScanned` many times a second for the same code, so
   * the first accepted read has to disarm the rest. A ref, not state: the guard
   * must hold *within* the current handler, and a state update lands a render too
   * late — which shows up as the pay screen being pushed twice.
   */
  const handled = useRef(false);

  /**
   * Re-read the permission whenever the app comes back to the foreground.
   *
   * Granting it in Settings happens entirely outside this process, and the hook
   * has no way to hear about it — so without this, a user who follows our own
   * "Open settings" advice returns to the very screen that sent them there.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void getPermission();
    });
    return () => subscription.remove();
  }, [getPermission]);

  // Re-arm when we come back from a payment; release the camera and the torch
  // when we leave.
  useFocusEffect(
    useCallback(() => {
      handled.current = false;
      setRejection(null);
      setFocused(true);
      return () => {
        setFocused(false);
        setTorch(false);
      };
    }, []),
  );

  const reject = useCallback((message: string) => {
    handled.current = true;
    setRejection(message);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setTimeout(() => {
      handled.current = false;
      setRejection(null);
    }, REJECT_COOLDOWN_MS);
  }, []);

  const accept = useCallback((data: string) => {
    handled.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.push({ pathname: '/(market)/pay', params: { qr: data } });
  }, []);

  const onScanned = useCallback(
    (data: string) => {
      if (handled.current) return;
      if (!isPaymentQr(data)) {
        reject("That's not a Yodl payment code");
        return;
      }
      accept(data);
    },
    [accept, reject],
  );

  /**
   * Pay a code someone sent you as a picture.
   *
   * Worth the extra dependency: merchant QRs circulate as screenshots in exactly
   * the markets Yodl serves, and a scanner that can only see through the lens
   * sends the user off to print something.
   */
  const scanFromLibrary = useCallback(async () => {
    setCheckingImage(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      const uri = picked.assets?.[0]?.uri;
      if (picked.canceled || !uri) return;

      const [found] = await scanFromURLAsync(uri, ['qr']);
      if (!found) {
        reject('No QR code in that image');
        return;
      }
      if (!isPaymentQr(found.data)) {
        reject("That image's code isn't a Yodl payment code");
        return;
      }
      accept(found.data);
    } catch {
      reject("Couldn't read that image");
    } finally {
      setCheckingImage(false);
    }
  }, [accept, reject]);

  // ── Gates ────────────────────────────────────────────────────────────────
  // Each of these replaces the camera rather than layering over it. A viewfinder
  // running behind a modal the user must deal with first is just battery.

  // No wallet gate. Privy provisions one at login (`createOnLogin` in the root
  // layout), so a signed-in user without a wallet is a state that lasts a moment
  // and has no action in it — and the scanner works during that moment. The
  // payment surface is where a wallet is actually required, and `YodlHost` is
  // what waits for it.
  if (!permission) return <Screen />;
  if (!permission.granted) {
    return <NeedsCamera permission={permission} onAllow={() => void requestPermission()} />;
  }

  // Clamped rather than fixed at 260: on a 360pt Android the frame has to leave
  // enough dimmed margin to still read as a window, and on a large phone it
  // should not grow into a rectangle you have to walk backwards from.
  const frame = Math.round(Math.max(220, Math.min(280, width * 0.72)));

  return (
    <View style={styles.root}>
      {/* The root Stack's bar follows the scheme; this screen is dark in both,
          so it owns its own and restores the previous one on unmount. */}
      <StatusBar style="light" />

      {focused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          // Narrowing to QR keeps the decoder off barcode symbologies no merchant
          // will present, which measurably reduces false reads in low light.
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => onScanned(data)}
        />
      ) : null}

      <View style={styles.chrome} pointerEvents="box-none">
        <View
          style={[styles.above, { paddingTop: insets.top + space.md }]}
          pointerEvents="box-none"
        >
          <View style={styles.wordmark}>
            <IconFinder size={20} color={MARK} />
            <Txt variant="bodyStrong" style={styles.onCamera}>
              Nightmarket
            </Txt>
          </View>

          {/*
            Photo and torch share this row now, which is not the mistake the
            torch sharing a row with *navigation* would be. Both tiles answer the
            same question — where does the camera's next image come from, the
            lens or a picture already taken — and grouping two controls that are
            peers is exactly why this pairing exists, not in spite of it. They
            stay tellable apart without a label: the torch fills solid when lit,
            the photo tile swaps its glyph for a spinner when busy, and neither
            state depends on where the tile sits. Rounded squares, not circles,
            so the pair floating over the feed rhymes with the marks in the frame.
          */}
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              // The icon is decorative; the label is the whole accessible name.
              accessibilityLabel="Open photo"
              accessibilityState={{ busy: checkingImage }}
              disabled={checkingImage}
              onPress={tap(() => void scanFromLibrary())}
              style={({ pressed }) => [styles.photo, pressed ? styles.pressed : null]}
            >
              {checkingImage ? (
                <ActivityIndicator size="small" color={MARK} />
              ) : (
                <IconPhoto size={22} color={MARK} />
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={torch ? 'Torch on' : 'Torch'}
              accessibilityState={{ selected: torch }}
              onPress={tap(() => setTorch((on) => !on))}
              style={({ pressed }) => [
                styles.torch,
                torch ? styles.torchOn : null,
                pressed ? styles.pressed : null,
              ]}
            >
              {/* A lit lamp is simply the brightest thing on the screen. It is not
                  the accent colour — Ultramarine means money has settled, and a
                  torch is not a payment. */}
              <IconTorch size={22} color={torch ? ON_LIGHT : MARK} />
            </Pressable>
          </View>
        </View>

        {/*
          The window. Its edges are the edges of the scrim, so the frame is drawn
          by what is *not* dimmed — no outline, no bracket, nothing to mistake for
          a box the code has to fill exactly. The band is a fixed height, which
          means the aim point cannot move no matter what appears below it.
        */}
        <View style={[styles.band, { height: frame }]} pointerEvents="box-none">
          {/*
            One path with a hole in it, rather than two dimmed rectangles with a
            gap between them. The gap could only ever be square — a `borderRadius`
            on the window would round nothing, because the window is the absence
            of scrim rather than a view drawn over the feed. So the corners have
            to be cut out of the scrim itself, which is what `evenodd` on a path
            containing both rectangles does. `react-native-svg` is already here
            drawing every icon in the app, including the marks in these corners.
          */}
          <Svg
            width={width}
            height={frame}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            accessible={false}
          >
            <Path d={scrimWithWindow(width, frame, radius.card)} fill={SCRIM} fillRule="evenodd" />
          </Svg>

          <View style={[styles.window, { width: frame }]} pointerEvents="none">
            {/* Fills the one undimmed region so the error is visible at the aim
                point itself, not just in the caption below it. Rounded to the
                same radius the scrim cuts, or the wash would square the corners
                back up at the exact moment the frame is being looked at. */}
            {rejection !== null ? <View style={styles.rejectWash} /> : null}
            <Finder style={styles.tl} rejected={rejection !== null} />
            <Finder style={styles.tr} rejected={rejection !== null} />
            <Finder style={styles.bl} rejected={rejection !== null} />
            <Finder style={styles.br} rejected={rejection !== null} />
          </View>
        </View>

        <View
          style={[styles.below, { paddingBottom: insets.bottom + space.lg }]}
          pointerEvents="box-none"
        >
          {/*
            Standing, not conditional. The old argument here was that a frame
            already drawn on the viewfinder says what to do, so a caption
            repeating "point your camera" is a line read once and then read past
            forever — that holds, but it was aimed at a sentence this screen
            never needs to say. No comparable payments scanner writes that
            caption; every one of them names what the frame *accepts* — "Scan a
            ShopBack QR code to pay" — which this screen has particular reason
            to say out loud, because `isPaymentQr` rejects most of what its
            camera sees and today the first thing a user learns about which
            codes work is the rejection itself.

            So the chip is always on, and a rejection is a second state of the
            same sentence rather than a second object appearing above it — same
            slot, same size class, its own `top` unchanged either way, so
            nothing beneath it jogs when the text swaps. The window wash and
            the four finder cores turning `reject` move alongside it, so the
            change reads as *that code was wrong*, not as new chrome arriving.
          */}
          <View style={styles.caption} pointerEvents="none">
            <View style={styles.captionChip}>
              <Txt
                variant="bodyStrong"
                style={[styles.captionText, rejection ? styles.onReject : null]}
                accessibilityLiveRegion="polite"
              >
                {rejection ?? 'Scan a Yodl payment code'}
              </Txt>
            </View>
          </View>

          <View style={styles.spacer} pointerEvents="none" />

          {/* The wallet is pinned to the foot of the viewfinder rather than
              floated as a chip: it is the one thing down here with a value in
              it, it answers "what is about to pay for this", and the chevron
              says it goes somewhere. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your wallet and activity"
            onPress={() => router.push('/(market)/activity')}
            style={({ pressed }) => [styles.walletStrip, pressed ? styles.pressed : null]}
          >
            <View style={styles.walletIdentity}>
              <Txt variant="caption" style={styles.onCameraDim}>
                Paying from
              </Txt>
              <Txt variant="mono" numberOfLines={1} style={styles.onCamera}>
                {wallet.address ? truncateAddress(wallet.address) : 'connecting…'}
              </Txt>
            </View>
            {/* The strip already answers "which wallet is paying"; the balance
                answers "can it" — the more useful fact to know before
                committing to a code at a stall. A failed or not-yet-ready read
                is a dash, never `$0.00`: a confident zero here would be a claim
                about money that might just be a bad RPC call. */}
            <View style={styles.walletMore}>
              {balance.data ? (
                <Txt variant="amountRow" style={styles.onCamera}>
                  {balance.data.amount}
                </Txt>
              ) : balance.error ? (
                <Txt variant="amountRow" style={styles.onCameraDim}>
                  —
                </Txt>
              ) : (
                <ActivityIndicator size="small" color={DIM} />
              )}
              <IconChevron size={16} color={DIM} />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * Wrap a press handler with the light haptic every viewfinder control shares.
 *
 * Fire-and-forget: a failed haptic — simulator, or haptics off in system
 * settings — must never swallow the press it accompanies.
 */
const tap = (run: () => void) => () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  run();
};

/**
 * One corner of the frame: a QR finder pattern rather than a generic L-bracket.
 *
 * The ring stays white throughout; only the core repaints on a rejection, so the
 * frame keeps its shape and the change reads as *that code was wrong* rather than
 * as the reticle having been replaced by a different drawing.
 */
function Finder({ style, rejected }: { style: ViewStyle; rejected: boolean }) {
  return (
    <View style={[styles.finder, style]}>
      <IconFinder size={FINDER} color={MARK} halo={HALO} core={rejected ? REJECT : MARK} />
    </View>
  );
}

/**
 * The camera gate, in its two genuinely different states.
 *
 * `canAskAgain` is the one that bites. Once Android has decided not to ask again
 * — the user dismissed the dialog twice, or picked "Don't allow" — calling
 * `requestPermission()` resolves immediately with `granted: false` and shows no
 * dialog at all. A button wired straight to it then does nothing, visibly, for
 * the rest of the app's life on that device, and the user has no way to know the
 * decision is theirs to reverse in Settings.
 *
 * So when we can still ask, we ask. When we can't, we say so and open Settings.
 */
function NeedsCamera({
  permission,
  onAllow,
}: {
  permission: PermissionResponse;
  onAllow: () => void;
}) {
  const colors = useColors();
  const blocked = !permission.canAskAgain;

  return (
    <Gate
      icon={<IconFinder size={26} color={colors.textSecondary} />}
      eyebrow="Permission"
      title={blocked ? 'Camera is switched off' : 'Let the camera see'}
      body={
        blocked
          ? "Android won't show the permission prompt again, so this has to be turned back on in Settings — Nightmarket can't do it from here."
          : 'Nightmarket reads merchant QR codes through the lens. Frames are decoded and discarded — nothing is recorded, nothing leaves the device.'
      }
      action={
        <Button
          label={blocked ? 'Open settings' : 'Allow camera'}
          onPress={blocked ? () => void Linking.openSettings() : onAllow}
        />
      }
      note={
        blocked ? (
          <Txt variant="small" tone="muted">
            Permissions › Camera › Allow
          </Txt>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  // ── Over the camera ──────────────────────────────────────────────────────
  // Everything in this block is hardcoded rather than themed: the ground here is
  // a live video feed, and the palette's text colours assume a known background.

  /** The dimmed field above the window. Flexes; the header sits at its top. */
  above: {
    flex: 1,
    backgroundColor: SCRIM,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 44 },
  /** Holds the photo and torch tiles as one group, right-aligned against the wordmark. */
  controls: { flexDirection: 'row', gap: space.sm },

  onCamera: { color: MARK },
  onCameraDim: { color: DIM },
  onReject: { color: REJECT },
  pressed: { opacity: 0.7 },

  photo: {
    width: 44,
    height: 44,
    borderRadius: radius.tile,
    backgroundColor: CHROME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torch: {
    width: 44,
    height: 44,
    borderRadius: radius.tile,
    backgroundColor: CHROME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchOn: { backgroundColor: MARK },

  /** The band holding the window and the two side panels of scrim. */
  /**
   * The window is centred by the band rather than by two flanking scrim views:
   * the dimming is one SVG path now, so there is nothing left to flex against
   * and the only thing this row still has to do is put the window in the middle.
   */
  band: { flexDirection: 'row', justifyContent: 'center' },
  window: { alignSelf: 'stretch' },
  /** The window's fill during a rejection — see `REJECT_WASH`. */
  rejectWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: REJECT_WASH,
    borderRadius: radius.card,
  },

  finder: { position: 'absolute' },
  tl: { top: FINDER_INSET, left: FINDER_INSET },
  tr: { top: FINDER_INSET, right: FINDER_INSET },
  bl: { bottom: FINDER_INSET, left: FINDER_INSET },
  br: { bottom: FINDER_INSET, right: FINDER_INSET },

  /**
   * The dimmed field below the window, weighted heavier than the one above so
   * the frame sits a little high — where the lens points when the phone is held
   * out at a stall, and clear of the hand.
   */
  below: {
    flex: 1.3,
    backgroundColor: SCRIM,
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  // Fixed slot, permanently occupied — the caption is standing, not shown only
  // on a rejection. The thing that must not move is the aim point, and that is
  // the `band` above — fixed at `frame` height, unaffected by anything in here.
  // The chip's own `top` is identical whether it reads the idle sentence or a
  // rejection: only its text and colour swap.
  caption: {
    marginTop: space.lg,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  captionChip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.control,
    backgroundColor: CHROME,
  },
  captionText: { color: MARK, textAlign: 'center' },
  /** Collapses first on a short device, so nothing below it is ever clipped. */
  spacer: { flex: 1, minHeight: space.lg },

  walletStrip: {
    alignSelf: 'stretch',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.card,
    backgroundColor: CHROME,
  },
  walletIdentity: { gap: 2, flexShrink: 1 },
  walletMore: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
