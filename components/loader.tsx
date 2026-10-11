import { TabcakeMark } from "@/components/brand";

/**
 * The loader — design.md §1, the overlap. The mark with its back tab sliding away and back, so
 * the Ember overlap shrinks and grows. It replaces every spinner; there is no second loading
 * treatment anywhere.
 *
 * tabcake_extension/components/loader.tsx is a verbatim copy; change this one, then copy it across.
 */
export function Loader({
  className,
  width = 20,
  /** Use "current" on a filled surface — a primary button — where the colour mark would clash. */
  tone = "colour",
  label = "Loading",
}: {
  className?: string;
  width?: number;
  tone?: "colour" | "current";
  label?: string;
}) {
  return (
    <span role="status" aria-label={label} className={`inline-flex ${className ?? ""}`}>
      <TabcakeMark size={width} variant={tone === "current" ? "mono" : "colour"} animated />
    </span>
  );
}
