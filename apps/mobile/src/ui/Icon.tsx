/**
 * The icon set.
 *
 * Five glyphs, one family. Emoji were the previous answer and they are the wrong
 * one: 🔦 and 🖼 render as a different drawing on every Android version, and ◎ / ▤
 * are shapes with no agreed meaning at all. These are real path geometry, so they
 * look the same everywhere and inherit the colour of whatever is holding them.
 *
 * The family rules, which is what makes five separate drawings read as one set:
 * a 24×24 box with all geometry inside a 20×20 live area, `fill="none"`, a single
 * 1.75 stroke weight, round caps and joins. No glyph is filled and no glyph uses a
 * second weight — the moment one does, the row stops looking like a set.
 *
 * Icons are decorative. They carry no accessible name of their own; the Pressable
 * that contains one owns the label, so a screen reader hears "Torch" rather than
 * "Torch, image".
 */

import type { ReactNode } from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export interface IconProps {
  /** Rendered box, in points. The stroke does not scale — 1.75 at every size. */
  size?: number;
  /** Required, not defaulted: an icon that picks its own colour outlives its context. */
  color: string;
}

/**
 * The shared shell. Every icon below is a set of primitives handed to this, which
 * is the only place the stroke contract is written down.
 */
function IconBase({ size = 24, color, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/**
 * The finder pattern — the app's mark, and the one glyph here that is not an icon.
 *
 * Every QR code carries three concentric square markers in its corners at a fixed
 * 7:5:3 module ratio. It is the most recognisable geometry in the entire product
 * and no payments app is using it, so it does four jobs at once:
 *
 *   • the four corners of the scanner's 260pt frame, at 28pt — the viewfinder
 *     literally shows you the shape it is hunting for, and the screen is
 *     unmistakably a QR scanner at a glance rather than a generic camera;
 *   • the app mark beside "Nightmarket" on sign-in, at 20pt;
 *   • the torch tile over the camera feed, at 44pt;
 *   • the rejection state, where the four cores fill `error` for the cooldown —
 *     so the structure changes, not only the hue.
 *
 * It breaks the 1.75 family weight on purpose. It is a mark, not a member of the
 * icon row: it never sits next to `IconTorch` or `IconGrid`, it is drawn at 20pt
 * and above, and at that size the set's hairline would read as a wire frame
 * rather than as the printed square it is quoting. `core` is separate from
 * `color` so the rejection state can repaint the middle without redrawing.
 */
export interface IconFinderProps extends IconProps {
  /** The centre square. Defaults to `color`; set to `error` to reject a scan. */
  core?: string;
  /**
   * A dark ring drawn beneath the mark, same geometry, heavier stroke. Only the
   * scanner's four corner marks pass this — they are the one white geometry
   * sitting inside the window, which is the one region of that screen the scrim
   * does not dim, so a white ring alone has no guaranteed contrast against live
   * video. Omit it — the wordmark, `sign-in` — and the drawing is exactly what
   * it was before this prop existed.
   */
  halo?: string;
}

export function IconFinder({ size = 24, color, core, halo }: IconFinderProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {halo ? (
        <Rect
          x={4}
          y={4}
          width={16}
          height={16}
          rx={5}
          stroke={halo}
          strokeWidth={5}
          strokeLinejoin="round"
        />
      ) : null}
      <Rect
        x={4}
        y={4}
        width={16}
        height={16}
        rx={5}
        stroke={color}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Rect x={9} y={9} width={6} height={6} rx={2} fill={core ?? color} />
    </Svg>
  );
}

/**
 * A stubby upright lamp: head, neck, barrel, one switch line.
 *
 * Deliberately no beam rays. The button's own fill carries the on state, and rays
 * would mean the icon changed shape between states — twice the drawing, half the
 * legibility at 22pt.
 */
export function IconTorch(props: IconProps) {
  return (
    <IconBase {...props}>
      <Rect x={7.5} y={3} width={9} height={4.5} rx={1.5} />
      <Line x1={9} y1={7.5} x2={9.8} y2={10} />
      <Line x1={15} y1={7.5} x2={14.2} y2={10} />
      <Rect x={9.8} y={10} width={4.4} height={11} rx={1.5} />
      <Line x1={9.8} y1={13.5} x2={14.2} y2={13.5} />
    </IconBase>
  );
}

/**
 * A picture, not a folder: frame, sun, horizon.
 *
 * The landscape is one open polyline rather than a filled mountain, so at small
 * sizes it stays a line drawing instead of collapsing into a dark wedge.
 */
export function IconPhoto(props: IconProps) {
  return (
    <IconBase {...props}>
      <Rect x={3} y={4.5} width={18} height={15} rx={3} />
      <Circle cx={8.75} cy={9.75} r={1.35} />
      <Polyline points="4,17.5 9.25,12.25 12.75,15.75 15.75,12.75 20,17" />
    </IconBase>
  );
}

/**
 * A person: head plus shoulders.
 *
 * The shoulders are an open arc that stops at y=20 rather than a closed body, so
 * the icon has the same optical height as the torch and the grid and the three of
 * them sit on one line without anyone nudging a margin.
 */
export function IconAccount(props: IconProps) {
  return (
    <IconBase {...props}>
      <Circle cx={12} cy={8.25} r={3.25} />
      <Path d="M4.75 20 A 7.25 7.25 0 0 1 19.25 20" />
    </IconBase>
  );
}

/**
 * A 2×2 of equal cells with a 3pt gutter.
 *
 * Equal on purpose — no hero cell. A bento layout would imply one panel matters
 * more than the others, which is a claim about a screen this icon doesn't know.
 */
export function IconGrid(props: IconProps) {
  return (
    <IconBase {...props}>
      <Rect x={3.5} y={3.5} width={7} height={7} rx={1.75} />
      <Rect x={13.5} y={3.5} width={7} height={7} rx={1.75} />
      <Rect x={3.5} y={13.5} width={7} height={7} rx={1.75} />
      <Rect x={13.5} y={13.5} width={7} height={7} rx={1.75} />
    </IconBase>
  );
}

/**
 * The affordance marker: this row goes somewhere.
 *
 * Render it at 16–18 rather than 22. A bare chevron has more optical mass than the
 * box glyphs at the same nominal size, and at 22 it stops being a hint and starts
 * being a second subject.
 */
export function IconChevron(props: IconProps) {
  return (
    <IconBase {...props}>
      <Polyline points="9.75,4.5 16.25,12 9.75,19.5" />
    </IconBase>
  );
}
