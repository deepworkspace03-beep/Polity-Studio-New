import { useRef } from "react";
import { cx } from "../../lib/utils";
import { Icon } from "../../components/Icon";

/**
 * Minimal "Go to Top / Go to Bottom" affordance shared by the Markdown
 * editor and the preview — each pane gets its own pair, scrolling only
 * itself, so the two never interfere.
 *
 * Interaction (identical on desktop and Android tablet):
 *   • a single click / tap  → an *immediate* jump to the absolute top or
 *     bottom. This is deliberately instant, not smooth: a smooth animation
 *     across a very large document's scroller (700k+ px on a 500-page note)
 *     caps its own velocity and stalls near the start — the "hang on first
 *     click". An instant jump lands in one frame at any document size.
 *   • press-and-hold        → smooth *incremental* movement (a steady glide
 *     up or down) via `onNudge`, for fine-grained travel on a tablet.
 *
 * Visibility: the parent passes explicit `atTop` / `atBottom` flags so the
 * threshold is viewport-aware (show once you're a screen away from an end),
 * not a fixed fraction of the whole document — 6% of a 700k px scroller is
 * ~50 screens, which is why the old fractional threshold hid the buttons on
 * exactly the large documents that need them most. When the flags are
 * omitted it falls back to the fraction so callers that only know `pct`
 * keep working.
 */
const NEAR_TOP = 0.06;
const NEAR_BOTTOM = 0.94;

/** Which background the buttons sit over, so their disc + chevron keep
    sufficient contrast in every theme combination (Studio light/dark ×
    document/paged-desk light/dark). "app" follows the app-theme tokens (the
    editor pane); "onLight"/"onDark" are fixed to read on a light or dark
    surface regardless of the app theme (the preview, which overlays the
    document's own reading theme or the dark paged desk). */
export type ScrollJumpTone = "app" | "onLight" | "onDark";

export function ScrollJump({
  pct,
  onTop,
  onBottom,
  onNudge,
  atTop,
  atBottom,
  side = "right",
  tone = "app",
  className,
}: {
  pct: number;
  onTop: () => void;
  onBottom: () => void;
  /** Called every animation frame while a button is held, with the
      direction (-1 up, +1 down), for smooth incremental scrolling. */
  onNudge?: (dir: -1 | 1) => void;
  /** Viewport-aware overrides — true hides the matching button. */
  atTop?: boolean;
  atBottom?: boolean;
  side?: "left" | "right";
  tone?: ScrollJumpTone;
  className?: string;
}) {
  const isTop = atTop ?? pct <= NEAR_TOP;
  const isBottom = atBottom ?? pct >= NEAR_BOTTOM;
  const showTop = !isTop;
  const showBottom = !isBottom;

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
      <JumpButton show={showTop} icon="chevronUp" label="Go to top" dir={-1} tone={tone} onClick={onTop} onNudge={onNudge} />
      <JumpButton show={showBottom} icon="chevronDown" label="Go to bottom" dir={1} tone={tone} onClick={onBottom} onNudge={onNudge} />
    </div>
  );
}

/** Per-tone disc + chevron styling. Each keeps a clear, WCAG-comfortable
    contrast against its background while staying a light, unobtrusive
    affordance (a soft disc, no hard border). */
const TONE_CLASS: Record<ScrollJumpTone, string> = {
  app: "bg-raised/90 text-ink-2 ring-1 ring-edge/70 hover:text-accent hover:ring-accent/40",
  onLight: "bg-black/[0.06] text-black/55 ring-1 ring-black/10 hover:bg-black/12 hover:text-black/80",
  onDark: "bg-white/15 text-white/85 ring-1 ring-white/15 hover:bg-white/25 hover:text-white",
};

/** Deliberately featherweight: a bare chevron on a barely-there disc —
    no border, no shadow — so it reads as an affordance, never as chrome
    covering the document. Tap = jump; press-and-hold = incremental glide. */
function JumpButton({
  show,
  icon,
  label,
  dir,
  tone,
  onClick,
  onNudge,
}: {
  show: boolean;
  icon: "chevronUp" | "chevronDown";
  label: string;
  dir: -1 | 1;
  tone: ScrollJumpTone;
  onClick: () => void;
  onNudge?: (dir: -1 | 1) => void;
}) {
  // Hold detection: after HOLD_MS the button switches from "tap" to a
  // continuous rAF glide; a release before then is treated as a tap (jump).
  const HOLD_MS = 300;
  const holdTimer = useRef<number | null>(null);
  const raf = useRef(0);
  const held = useRef(false);

  const stop = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
  };

  const beginHold = (e: React.PointerEvent) => {
    if (!onNudge) return; // no incremental mode — plain tap only
    held.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      const step = () => {
        onNudge(dir);
        raf.current = requestAnimationFrame(step);
      };
      step();
    }, HOLD_MS);
  };

  const endHold = () => {
    const wasHold = held.current;
    stop();
    held.current = false;
    if (!wasHold) onClick(); // short press → jump
  };

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      // Keyboard activation (Enter/Space) always jumps; pointer press
      // distinguishes tap vs hold, so suppress the synthetic click there.
      onClick={(e) => {
        if (e.detail === 0) onClick();
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        beginHold(e);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        endHold();
      }}
      onPointerLeave={() => stop()}
      onPointerCancel={() => stop()}
      className={cx(
        "flex h-6 w-6 touch-none items-center justify-center rounded-full backdrop-blur-[2px] transition-[opacity,color,background-color] duration-300",
        TONE_CLASS[tone],
        show ? "pointer-events-auto opacity-90 hover:opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
