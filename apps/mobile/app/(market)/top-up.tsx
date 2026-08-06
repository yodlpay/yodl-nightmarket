/**
 * Top up — which in a self-custodial wallet means *receive*.
 *
 * "Top up" in a fiat wallet is a funding-method chooser: bank, minimart, card,
 * then an amount keypad. This wallet has no method to offer and no amount to
 * collect, because the sender decides both — building that shell would produce a
 * screen with one dead row in it. What it can do is show an address. So the
 * label is the user's word and the layout is the crypto one: identity, code,
 * address, warning, share.
 *
 * The label stays "Top up" in the tile and in the title. "Receive" is what every
 * crypto wallet calls this and it is the wrong word here twice over: the
 * audience for this app is not assumed to be crypto-fluent, and "Receive" one
 * tap from a payments feed reads as *incoming payments* rather than as *funding
 * your own wallet*.
 *
 * ── Two things this screen must not get wrong ─────────────────────────────────
 *
 * **The address is shown in full.** `0x12933a…2Bd4bB` cannot be typed back in,
 * and a truncated string as the only copy target is a copy control that has
 * silently failed for anyone whose paste did not work. The copy affordance is
 * part of the same object as the address rather than a link parked beside it, so
 * there is one thing to tap and no question about what it copies.
 *
 * **The network warning is stated as a consequence, not as a note.** The address
 * here is the wallet's address on every EVM chain, so it will happily receive
 * USDC on Arbitrum, or ETH on Base, or anything else — none of which is what
 * this screen just promised. Money on the wrong chain may be gone; money in the
 * wrong token is merely invisible. Every reference wallet that shows an address
 * says so outright, and this one names the chain it counts.
 *
 * The QR encodes the bare address rather than an EIP-681 URI. A URI scans in
 * some wallets and produces a confusing "unsupported request" in the rest; a
 * 42-character address scans in all of them.
 *
 * Presented as a sheet. It is a glance-and-dismiss surface, and
 * `fullScreenModal` is already spoken for by the hosted Yodl WebViews — a card
 * sheet is visibly a different class of thing than "you have left the app's
 * chrome".
 */

import { chainName } from '@nightmarket/shared';
import { radius, space } from '@nightmarket/theme';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import QRCodeStyled from 'react-native-qrcode-styled';
import { getAddress, isAddress } from 'viem';
import { Button } from '~/ui/Button';
import { Card } from '~/ui/Card';
import { Screen } from '~/ui/Screen';
import { Txt } from '~/ui/Txt';
import { useColors, useInvertedColors, useScheme } from '~/ui/theme';
import { BALANCE_CHAIN_ID } from '~/wallet/useBalance';
import { useWallet } from '~/wallet/useWallet';

/**
 * The code's box, pinned rather than measured.
 *
 * A 42-character address is 42 bytes, which is exactly the byte-mode capacity of
 * a version-3 code at the default error correction — so it is always 29×29
 * modules and the rendered size is always `29 × pieceSize`. Pinning it is what
 * lets the connecting state draw a skeleton at the code's real dimensions
 * instead of the layout jumping when the address arrives.
 */
const QR_MODULES = 29;
const QR_PIECE = 7;
const QR_SIZE = QR_MODULES * QR_PIECE;

/** Long enough to read, short enough that the control is back before you look again. */
const COPIED_MS = 1_600;

export default function TopUp() {
  const wallet = useWallet();

  // There is no "no wallet yet" gate any more. The wallet is provisioned at
  // login, so the only state below a connected one is *still arriving* — which
  // `QrPanel` and `AddressField` already draw as a skeleton at the exact size of
  // what is coming. A dead-end screen for a wait of a few hundred milliseconds
  // was telling the user to go and do something about a thing that was already
  // happening.

  // Checksummed for display, the QR and the share sheet alike. EIP-55's mixed
  // case is a checksum: a wallet pasting this address can tell a mistyped
  // character from a real one, and an all-lowercase address silently gives up
  // that check on the one screen in the app where money is arriving from
  // somewhere else. `getAddress` throws on a non-address, which `wallet.address`
  // never is — but the guard keeps a provider quirk from blanking the screen.
  const address =
    wallet.address && isAddress(wallet.address, { strict: false })
      ? getAddress(wallet.address)
      : wallet.address;

  return <Receive address={address} />;
}

function Receive({ address }: { address: string | null }) {
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <Txt variant="title">Top up</Txt>
          {/* One chain, named from the same constant the balance is read on.
              This screen used to list all of `SUPPORTED_CHAIN_IDS`, which was
              wrong the moment "Spendable" became a Base-only figure: USDC sent
              on Arbitrum would arrive at this exact address, be perfectly safe,
              and never appear in the number this screen exists to raise. */}
          <Txt variant="body" tone="secondary">
            Send USDC to this address on {chainName(BALANCE_CHAIN_ID)}. It lands in your wallet and
            you can spend it here.
          </Txt>
        </View>

        <QrPanel address={address} />

        <AddressField address={address} />

        {/* Stated as the consequence, not as a caution. "Only send USDC on
            Base" alone is advice; the second sentence is why. Two failure modes
            are folded into one line on purpose — the wrong chain loses the money
            outright, the right chain with the wrong token does not, and a screen
            that ranked them would invite reading past the smaller one. */}
        <Card>
          <Txt variant="small" tone="muted">
            Only send USDC on {chainName(BALANCE_CHAIN_ID)}. Another network or another token will
            not show up here, and may be lost.
          </Txt>
        </Card>

        <Button
          label="Share address"
          variant="quiet"
          disabled={address === null}
          onPress={() => {
            if (address) void Share.share({ message: address }).catch(() => {});
          }}
        />
      </ScrollView>

      {/* The screen's one `radius.full`. A sheet needs a way out that does not
          depend on the drag gesture, and "Done" is the word every other
          dismissable surface in this app uses. */}
      <View style={styles.footer}>
        <Button label="Done" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

/**
 * The code, on a card that stays light in both schemes.
 *
 * This is the one place the app deliberately ignores the device's appearance. A
 * QR code is read by a camera, not by a person, and scanners expect dark modules
 * on a light field with a quiet zone around them. Inverting it for dark mode
 * would be a consistent design decision that made the screen's only functional
 * element harder to use.
 *
 * `useInvertedColors()` in dark mode *is* the light palette, so the light values
 * are reachable without importing the raw palette or inventing a colour.
 */
function QrPanel({ address }: { address: string | null }) {
  const colors = useColors();
  const flipped = useInvertedColors();
  const scheme = useScheme();
  const paper = scheme === 'dark' ? flipped : colors;

  return (
    <View style={styles.qrRow}>
      <Card style={{ backgroundColor: paper.surface }}>
        <View style={styles.qrBox}>
          {address ? (
            // Square modules, no logo, no gradient. Decoration on a QR code is
            // error-correction budget spent on something that is not the job.
            <QRCodeStyled data={address} pieceSize={QR_PIECE} color={paper.text} />
          ) : (
            // A skeleton at the code's exact size, so nothing moves when the
            // address arrives. A spinner here would be a second thing to watch.
            <View style={[styles.qrSkeleton, { backgroundColor: colors.skeleton }]} />
          )}
        </View>
      </Card>
    </View>
  );
}

/**
 * The address and its copy control as one object.
 *
 * Wrapped across two lines rather than middle-truncated: this is the string
 * someone may have to read out or type, and both ends of an ellipsis are useless
 * for that. The whole row is the tap target — a 13pt "Copy" link beside a field
 * is a 13pt tap target, and this is the only action on the screen that matters.
 *
 * The trailing label flips to "Copied" rather than firing a toast. A toast on a
 * sheet lands over the thing it is confirming, and the confirmation belongs on
 * the control that was pressed.
 */
function AddressField({ address }: { address: string | null }) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The sheet can be dismissed inside the 1.6s window, and a timer that outlives
  // the screen sets state on an unmounted component.
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  if (!address) {
    return (
      <View style={[styles.address, { backgroundColor: colors.surfaceSecondary }]}>
        <Txt variant="mono" tone="muted" style={styles.addressText}>
          Connecting…
        </Txt>
      </View>
    );
  }

  const copy = () => {
    void Clipboard.setStringAsync(address);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Copy your wallet address"
      onPress={copy}
      style={({ pressed }) => [
        styles.address,
        { backgroundColor: pressed ? colors.surfaceHover : colors.surfaceSecondary },
      ]}
    >
      <Txt variant="mono" numberOfLines={2} style={styles.addressText}>
        {address}
      </Txt>
      <Txt variant="caption" tone="secondary" accessibilityLiveRegion="polite">
        {copied ? 'Copied' : 'Copy'}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: space.lg, paddingTop: space.lg, paddingBottom: space.xl },
  intro: { gap: space.sm },
  /** Centres the card on its own content width rather than stretching it. */
  qrRow: { alignItems: 'center' },
  qrBox: { width: QR_SIZE, height: QR_SIZE, alignItems: 'center', justifyContent: 'center' },
  qrSkeleton: { width: QR_SIZE, height: QR_SIZE, borderRadius: radius.control },
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.control,
  },
  addressText: { flex: 1 },
  /** In flow rather than absolute: a sheet is short enough to own its own foot. */
  footer: { paddingTop: space.lg, paddingBottom: space.lg },
});
