import { cx } from "../../lib/utils";
import { Icon } from "../../components/Icon";

/**
 * Minimal "Go to Top / Go to Bottom" affordance shared by the Markdown
 * editor and the preview — each pane gets its own pair, scrolling only
 * itself, so the two never interfere.
 *
 * Nothing shows until the reader has scrolled meaningfully away from the
 * top; each button then fades away as its own end comes into view (Top
 * near the top, Bottom near the bottom). The buttons stay mounted and
 * animate opacity so both appearing and disappearing are smooth, and
 * they're deliberately small and translucent so they never read as
 * covering the content beneath them.
 *
 * `pct` is the document position (0 = top, 1 = bottom) — the same
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
  const scrolled = pct > NEAR_TOP;
  const showTop = scrolled;
  const showBottom = scrolled && pct < NEAR_BOTTOM;

  return (
    <div
      className={cx(
        // right-5 keeps the buttons clear of both the editor's fat overlay
        // scrollbar and the preview iframe's own native scrollbar.
        "pointer-events-none absolute bottom-2.5 z-20 flex flex-col gap-1",
        side === "right" ? "right-5" : "left-5",
        className,
      )}
    >
      <JumpButton show={showTop} icon="toTop" label="Go to top" onClick={onTop} />
      <JumpButton show={showBottom} icon="toBottom" label="Go to bottom" onClick={onBottom} />
    </div>
  );
}

function JumpButton({ show, icon, label, onClick }: { show: boolean; icon: "toTop" | "toBottom"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={onClick}
      className={cx(
        "flex h-7 w-7 items-center justify-center rounded-full border border-edge/60 bg-surface/70 text-faint shadow-sm backdrop-blur-sm transition-opacity duration-300 hover:border-accent/60 hover:text-accent",
        show ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Icon name={icon} size={13} />
    </button>
  );
}
