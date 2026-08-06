#!/usr/bin/env python3
"""
Generate Nightmarket's app icons.

The mark is a QR finder pattern — the concentric square in the corner of every QR
code — in Paper on Ink. It is the same drawing as `IconFinder` in src/ui/Icon.tsx,
which is the app's mark everywhere else: the four corners of the scanner's frame,
the wordmark on sign-in, the torch tile, the Scan tile on activity. The launcher
icon and the reticle are deliberately the same object.

No glow and no scan line. The old mark was a magenta-and-lime neon sign with a
blurred copy composited under it, which is precisely the convention the redesign
removed — and it meant the first frame of every cold launch was still the old
design a full second after the app had become the new one.

The geometry below is Icon.tsx's, in its own 24-unit box:

    ring   x=4 y=4 w=16 h=16  rx=5  stroke=3   (stroke centred on the path)
    core   x=9 y=9 w=6  h=6   rx=2  filled

SVG centres a stroke on its path and PIL draws it inward from the box, so the
ring's box is widened by half the stroke and its radius by the same, which is
what keeps the two drawings identical rather than merely similar.

Committed as a script rather than as loose PNGs so the mark can be regenerated at
any size, and so the geometry is reviewable. Run:

    python3 scripts/make-icons.py
"""

from PIL import Image, ImageDraw

INK = (26, 24, 20, 255)  # dark.bg  — #1A1814, and app.config.ts's SPLASH_BG
PAPER = (243, 241, 236, 255)  # light.bg — #F3F1EC, dark mode's primary text

SIZE = 1024

# Icon.tsx's 24-unit box, so the numbers below can be read straight off it.
BOX = 24.0
RING_INSET, RING_SPAN, RING_RADIUS, STROKE = 4.0, 16.0, 5.0, 3.0
CORE_INSET, CORE_SPAN, CORE_RADIUS = 9.0, 6.0, 2.0


def draw_mark(size: int, scale: float = 1.0) -> Image.Image:
    """The glyph on a transparent canvas. `scale` shrinks the mark within the canvas."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    span = size * 0.72 * scale
    unit = span / BOX
    origin = (size - span) / 2

    def at(u: float) -> float:
        return origin + u * unit

    # The ring. Half a stroke wider than the centreline box in every direction,
    # because PIL grows an outline inward and SVG grows it both ways.
    half = STROKE / 2
    d.rounded_rectangle(
        (
            at(RING_INSET - half),
            at(RING_INSET - half),
            at(RING_INSET + RING_SPAN + half),
            at(RING_INSET + RING_SPAN + half),
        ),
        radius=(RING_RADIUS + half) * unit,
        outline=PAPER,
        width=max(1, round(STROKE * unit)),
    )

    # The core. The gap between the two is what makes this read as a QR eye
    # rather than as a generic rounded square.
    d.rounded_rectangle(
        (
            at(CORE_INSET),
            at(CORE_INSET),
            at(CORE_INSET + CORE_SPAN),
            at(CORE_INSET + CORE_SPAN),
        ),
        radius=CORE_RADIUS * unit,
        fill=PAPER,
    )

    return img


def on_ink(mark: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", mark.size, INK)
    return Image.alpha_composite(bg, mark)


def main() -> None:
    out = "assets"

    on_ink(draw_mark(SIZE)).save(f"{out}/icon.png")

    # Android adaptive icons: the launcher masks and animates these separately,
    # and it crops hard — the foreground is drawn small so nothing important
    # lands outside the safe zone.
    Image.new("RGBA", (SIZE, SIZE), INK).save(f"{out}/android-icon-background.png")
    draw_mark(SIZE, scale=0.62).save(f"{out}/android-icon-foreground.png")

    # Monochrome (themed icons): silhouette only, no colour.
    mono = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    alpha = draw_mark(SIZE, scale=0.62).getchannel("A").point(lambda a: 255 if a > 90 else 0)
    mono.putalpha(alpha)
    mono.paste((255, 255, 255, 255), mask=alpha)
    mono.save(f"{out}/android-icon-monochrome.png")

    # Splash: transparent, small, on the splash background colour from app.config.
    draw_mark(SIZE, scale=0.52).save(f"{out}/splash-icon.png")

    on_ink(draw_mark(96)).resize((48, 48), Image.LANCZOS).save(f"{out}/favicon.png")

    print("wrote icon.png, android-icon-*.png, splash-icon.png, favicon.png")


if __name__ == "__main__":
    main()
