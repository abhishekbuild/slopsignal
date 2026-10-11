/**
 * A site, as its first letter on a flat slate disc — the same fallback the account avatar uses.
 * Slate, not the accent: the chrome is monochrome, and blue means "where you are" (design.md §3).
 *
 * A deliberate copy of `tabcake_dashboard/components/monogram.tsx`, like `button.tsx`, `stack.tsx`
 * and `mark.tsx`. If you change one, change the other.
 *
 * design.md §1 and §9 make this the rule everywhere a favicon would go. Here there is a second
 * reason besides privacy: reading real favicons needs Chrome's `favicon` permission, which adds
 * "Read the icons of the websites you visit" to the install dialog — a second warning beside the
 * content script's, at the moment a new user is deciding whether to trust this.
 */
export function Monogram({
  domain,
  size = 20,
  className = "",
}: {
  domain: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-muted text-meta font-medium text-foreground ${className}`}
    >
      {domain.replace(/^www\./, "").charAt(0).toUpperCase()}
    </span>
  );
}
