import { cx } from "../../lib/utils";
import { Icon } from "../../components/Icon";

/**
 * Minimal, unobtrusive "Go to Top / Go to Bottom" affordance shared by the
 * Markdown editor and the preview so both panes navigate a long document
 * the same way.
 *
 * The buttons only appear once the reader has scrolled meaningfully away
 * from the top, and each one hides as its own end comes into view — Top
 * disappears near the top, Bottom near the bottom — so at rest the control
 * is invisible and never competes with the content.
 *
 * `pct` is the document position (0 = top, 1 = bottom). It's the same
 * fraction the editor scrollbar and the preview position readout already
 * track, so the whole workspace shares one notion of "where am I".
 */
const NEAR_TOP = 0.06;
const NEAR_BOTTOM = 0.94;

export function ScrollJump({
  pct,
  onTop,
  onBottom,
  side = "right",
  className,
}: {
  pct: number;
  onTop: () => void;
  onBottom: () => void;
  side?: "left" | "right";
  className?: string;
}) {
  // "Appear only after meaningful scrolling": nothing shows until the reader
  // is past the near-top band. Then Top is offered everywhere except the top,
  // Bottom everywhere except the bottom.
  const scrolled = pct > NEAR_TOP;
  const showTop = scrolled;
  const showBottom = scrolled && pct < NEAR_BOTTOM;
  if (!showTop && !showBottom) return null;

  return (
    <div
      className={cx(
        "pointer-events-none absolute bottom-3 z-20 flex flex-col gap-1.5",
        side === "right" ? "right-3" : "left-3",
        className,
      )}
    >
      {showTop && <JumpButton icon="toTop" label="Go to top" onClick={onTop} />}
      {showBottom && <JumpButton icon="toBottom" label="Go to bottom" onClick={onBottom} />}
    </div>
  );
}

function JumpButton({ icon, label, onClick }: { icon: "toTop" | "toBottom"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface/90 text-ink-2 shadow-md backdrop-blur transition-colors hover:border-accent hover:text-accent"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
