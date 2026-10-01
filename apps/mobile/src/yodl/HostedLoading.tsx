/**
 * What the user looks at while a hosted Yodl surface comes up — the wallet it
 * needs, then the page itself — and what they get instead if the wallet never
 * arrives at all.
 *
 * One component for both, because they are one uninterrupted pause to the user.
 *
 * The loop is the same file the theme hands the hosted UI as
 * `images.dark.loading`, bundled locally. That matters more than where it is
 * stored: the native wait and the hosted wait are one pause to the user, and they
 * should not be two different animations that happen to follow each other.
 *
 * The dark cut in both schemes, the same reach `YodlHost` makes for its colours:
 * the ground here is Ink either way.
 *
 * The asset already draws the mark and its arc, centred on Ink, at phone aspect
 * — so this component draws neither a mark nor a scrim over it. It supplies the
 * one thing the video can't: the caption.
 *
 * The error case is the exception, and keeps the old argument intact: when the
 * wallet failed to provision, nothing is coming, and motion that continues
 * forever under a dead screen is a lie. So the video is cut on error and a still
 * mark sits on bare Ink. The message is Privy's own, which names the cause.
 */

import { dark, space } from '@nightmarket/theme';
import { createVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconFinder } from '~/ui/Icon';
import { Txt } from '~/ui/Txt';

/**
 * Bundled, not fetched. It is the same file the theme points the hosted UI at —
 * `images.dark.loading` — downloaded once and committed, because this plays at
 * the one moment the app cannot afford another round trip: the user is already
 * waiting on the network for the thing this is covering for. 21 KB.
 *
 * `require` rather than an import: Metro resolves media this way, and there is no
 * ambient `*.mp4` module declaration to make the import form typecheck.
 *
 * If the hosted asset is ever re-cut, re-download it — the theme URL stays the
 * source of truth for what this should be:
 *   curl -o assets/loading-arc-dark.mp4 \
 *     https://nightmarket-theme-assets.vercel.app/loading-arc-dark.mp4
 */
const LOADING_VIDEO = require('../../assets/loading-arc-dark.mp4');

/**
 * One player for the app's lifetime, built at import time rather than at mount.
 *
 * `useVideoPlayer` ties the native player to the component, so every appearance
 * of this screen was paying to construct a player, open the asset and decode a
 * first frame — at the exact moment the user is already waiting on something
 * else. That is the hitch. Built here, the asset is open and prepared long before
 * anything needs it, and mounting is only an attach.
 *
 * Safe to leak, because it is not a leak: a single 21 KB local loop, held for the
 * lifetime of the process, is the cost of never paying for it again. The effect
 * below keeps it paused whenever it is off screen, so nothing is decoding while
 * nobody is looking at it.
 *
 * Module scope on purpose — this file is imported by `YodlHost` and the pay
 * route, so construction lands during bundle evaluation at startup rather than on
 * the wait path.
 */
const player = createVideoPlayer(LOADING_VIDEO);
player.loop = true;
// Muted is the point, not a default worth inheriting: this plays unprompted while
// the user waits, and audio nobody asked for is how a payment app gets muted at
// the OS level forever. `mixWithOthers` follows from it — a silent video has no
// business interrupting whatever the user is listening to.
player.muted = true;
player.audioMixingMode = 'mixWithOthers';

export function HostedLoading({ error }: { error?: Error | null }) {
  /**
   * Runs on mount and whenever `error` flips — which it can do *after* mount,
   * since the wallet fails partway through the wait rather than before it.
   *
   * The rewind matters now that the player outlives the screen: without it the
   * second wait of a session would pick up wherever the first one was cut, and
   * the arc would appear mid-sweep.
   */
  useEffect(() => {
    if (error) {
      player.pause();
      return;
    }
    player.currentTime = 0;
    player.play();
    return () => player.pause();
  }, [error]);

  if (error) {
    return (
      <View style={[styles.root, styles.centred]}>
        {/* 40pt: the mark is drawn at 20 and above by contract, and this is the
            only place it is the sole thing on screen. */}
        <IconFinder size={40} color={dark.text} />
        <Txt variant="small" style={styles.error}>
          {error.message}
        </Txt>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Not interactive, and `pointerEvents` lives on this wrapper rather than
          on `VideoView` so the native view is never handed a touch responder to
          argue with. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          // The source is 1080×2340 — already a phone frame — so `cover` crops
          // almost nothing on a portrait device, while `contain` would letterbox
          // a screen whose whole job is to be one continuous ground.
          contentFit="cover"
          nativeControls={false}
          // Android only, and the opposite of the usual advice: `surfaceView` is
          // cheaper to run but punches a hole through the view hierarchy, and it
          // shows — a black flash on attach, which on a screen that exists to
          // cover a wait is the one artefact that defeats the purpose. This is a
          // 21 KB loop on screen for a couple of seconds, so the power argument
          // for `surfaceView` is worth less than a clean first frame.
          surfaceType="textureView"
        />
      </View>

      <View style={styles.centred} pointerEvents="none">
        {/* Sits below the mark the video is drawing, not on top of it. Offset
            rather than a spacer under a mark of our own: the only mark on this
            screen is the one in the loop. Not a step sequence either — we cannot
            observe which stage the boot is in, and claiming progress we can't see
            is worse than claiming none. */}
        <Txt variant="small" style={styles.caption}>
          Getting Yodl ready
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * `alignSelf` is not decoration. The SDK's loading overlay is an absolute fill
   * with `alignItems: 'center'`, so a plain `flex: 1` child comes out as tall as
   * the screen and only as *wide* as its content — which was invisible while this
   * was a mark on a transparent ground, and a narrow column of video the moment
   * it wasn't. Stretching here means both callers get the same full-bleed frame
   * without either of them having to know that.
   */
  root: { flex: 1, alignSelf: 'stretch' },

  /**
   * Centres itself rather than trusting whoever renders it. It is handed to two
   * different parents — `YodlHost`'s wait view and the SDK's loading overlay —
   * and a version of this that only set `alignItems` came out pinned to the
   * bottom of the screen, clipped by the gesture bar, in one of them. Owning
   * both axes costs nothing and cannot be undone by a caller's layout.
   */
  centred: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
    padding: space.xl,
  },

  /**
   * Pushed clear of the arc. The mark in the loop is drawn at roughly a quarter
   * of the frame's width and the arc sweeps outside it, so a caption centred with
   * it would land inside the animation. Measured against the asset, not derived
   * from the scale — if the loop is ever re-cut, this is the number to re-check.
   */
  caption: { color: dark.textSecondary, textAlign: 'center', marginTop: 132 },
  error: { color: dark.error, textAlign: 'center' },
});
