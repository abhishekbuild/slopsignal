import { useId } from "react";

/**
 * The logo — design.md §4. The source of truth is assets/logo/: two browser tabs overlap, a
 * Butter one behind and a Tomato one in front, and Ember is where they meet.
 *
 * Everything that draws the logo comes through this file, and the loader (loader.tsx) is this
 * mark with its back tab moving. tabcake_extension/components/brand.tsx is a verbatim copy; change
 * this one, then copy it across.
 */

/** The geometry, lifted unchanged from assets/logo/tabcake-mark.svg. The only copy of it. */
export const MARK = {
  /** The full box, with room around the tabs. The loader uses it: the back tab slides into it. */
  viewBox: "0 0 120 120",
  /** The tabs' own bounds, x 14–106 and y 20–102. A still mark uses it, so no space is wasted. */
  bounds: "14 20 92 82",
  back: "M26 32 L27 32 Q32 32 32 27 L32 26 Q32 20 38 20 L52 20 Q58 20 58 26 L58 27 Q58 32 63 32 L66 32 Q78 32 78 44 L78 66 Q78 78 66 78 L26 78 Q14 78 14 66 L14 44 Q14 32 26 32 Z",
  front:
    "M54 56 L55 56 Q60 56 60 51 L60 50 Q60 44 66 44 L80 44 Q86 44 86 50 L86 51 Q86 56 91 56 L94 56 Q106 56 106 68 L106 90 Q106 102 94 102 L54 102 Q42 102 42 90 L42 68 Q42 56 54 56 Z",
  /** The one-colour mark parts the tabs with this gap, from tabcake-mark-mono-ink.svg. */
  gap: 7,
} as const;

/**
 * `colour` is the mark. `mono` is the one-colour version in `currentColor`, the tabs parted by a
 * transparent gap so it works on any surface. `outline` is the empty-state graphic.
 *
 * `size` is the height of the tabs themselves; the width follows at 92:82.
 *
 * `animated` puts the back tab in motion (`.overlap-back` in the stylesheet). The overlap is the
 * back tab clipped by the front one, and the clip does not move, so the Ember shrinks and grows
 * with the geometry rather than fading. Only `Loader` sets it, and it draws the full box instead,
 * a square of `size`, because the back tab needs room to slide.
 */
export function TabcakeMark({
  size = 18,
  variant = "colour",
  animated = false,
  className,
}: {
  size?: number;
  variant?: "colour" | "mono" | "outline";
  animated?: boolean;
  className?: string;
}) {
  const id = useId();
  const back = animated ? "overlap-back" : undefined;
  return (
    <svg
      viewBox={animated ? MARK.viewBox : MARK.bounds}
      width={animated ? size : Math.round((size * 92) / 82)}
      height={size}
      aria-hidden="true"
      className={className}
    >
      {variant === "colour" ? (
        <>
          <defs>
            <clipPath id={id}>
              <path d={MARK.front} />
            </clipPath>
          </defs>
          <path d={MARK.back} className={`fill-butter ${back ?? ""}`} />
          <path d={MARK.front} className="fill-tomato" />
          <g clipPath={`url(#${id})`}>
            <path d={MARK.back} className={`fill-ember ${back ?? ""}`} />
          </g>
        </>
      ) : (
        <>
          <defs>
            <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
              <rect width="120" height="120" fill="white" />
              <path
                d={MARK.front}
                fill="black"
                stroke="black"
                strokeWidth={variant === "mono" ? MARK.gap : 0}
                strokeLinejoin="round"
              />
            </mask>
          </defs>
          <g mask={`url(#${id})`}>
            <path d={MARK.back} {...paint(variant, back)} />
          </g>
          <path d={MARK.front} {...paint(variant)} />
        </>
      )}
    </svg>
  );
}

function paint(variant: "mono" | "outline", className?: string) {
  return variant === "mono"
    ? { fill: "currentColor", className }
    : {
        fill: "none",
        className: `stroke-border-strong ${className ?? ""}`,
        strokeWidth: 1,
        vectorEffect: "non-scaling-stroke" as const,
      };
}

/**
 * The boards' lockup proportions, restated for the tight mark. On the boards the wordmark is 0.75
 * of the 120-unit box and sits 0.18 of it away, and the tabs are 82 units tall with 14 units of
 * margin on their right. Against the tabs' own height that is a 0.75 × 120/82 = 1.10 font and a
 * (0.18 × 120 + 14) / 82 = 0.43 gap.
 */
const WORDMARK_SCALE = 1.1;
const LOCKUP_GAP = 0.43;

/** "tabcake" — Manrope 800, lowercase, sized from the height of the mark it sits beside. */
export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: Math.round(size * WORDMARK_SCALE) }}>
      tabcake
    </span>
  );
}

/**
 * The lockup and the only one: the mark, then the wordmark, in the boards' proportions. The size
 * is the height of the tabs: `sm` 22px (the sidebar, the popup header; 24 pushed the sidebar's
 * version chip to its edge) and `md` 40px (the signed-out pages and the error pages).
 */
export function TabcakeLogo({
  size = "md",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const px = size === "sm" ? 22 : 40;
  return (
    <span
      role="img"
      aria-label="Tabcake"
      className={`inline-flex items-center text-foreground ${className ?? ""}`}
      style={{ gap: Math.round(px * LOCKUP_GAP) }}
    >
      <TabcakeMark size={px} />
      <Wordmark size={px} />
    </span>
  );
}
