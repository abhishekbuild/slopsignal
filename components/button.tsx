import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  /** The committed action, in the brand black. One per view (design.md §7). */
  primary: "border border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
  /** The default button — reach for this first. */
  secondary: "border border-border bg-secondary text-secondary-foreground hover:bg-muted",
  ghost: "border border-transparent text-foreground hover:bg-muted",
  /** A ghost whose label is muted until hovered: the header's and footer's icon buttons. */
  quiet: "border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  /** The one destructive confirm the popup has: Forget it. */
  danger: "border border-destructive/40 bg-card text-destructive hover:bg-destructive-surface",
} as const;

const SIZES = {
  default: "h-8 px-3",
  /** An icon alone: 32×32, the popup's floor for anything you press (audit #24). */
  icon: "size-8",
} as const;

/**
 * design.md §7, the `sm` size: h32, radius-md 8px, `ui` 14/500, active nudges down 1px. Nothing in
 * the popup is pressed at less than 32px tall; an icon-only button is `size="icon"` and carries an
 * `aria-label` and a matching `title`.
 *
 * No focus classes: style.css declares the one ring for every `:focus-visible` (§11). Disabled is
 * a fill, not a fade (design.md 4.2): the muted surface and label at full opacity, with pointer
 * events kept so a disabled button can still explain itself. The dashboard's Button does the same.
 */
export function Button({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-ui font-medium transition-colors duration-120 ease-out active:translate-y-px disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted [&_svg]:shrink-0 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
