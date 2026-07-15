import { useEffect, useRef, useState } from "react";
import { cx } from "../../lib/utils";

/**
 * A fat, always-grabbable scrollbar overlaid on the editor's own scroller.
 *
 * The native scrollbar is thin (and effectively invisible on touch), which
 * makes scrubbing through a long document awkward on a tablet. This draws a
 * wide, high-contrast thumb that's easy to drag with a finger, plus a live
 * position readout while dragging. It never *replaces* scrolling — wheel,
 * touch-drag and keyboard scrolling on the scroller stay fully intact — so
 * even if the thumb misbehaved, the document is still scrollable the normal
 * way. It only adds a faster affordance on top.
 *
 * `revision` is bumped by CodeMirror whenever the document changes so the
 * thumb geometry recomputes as the content grows or shrinks (scroll and
 * resize are observed directly).
 */
export function EditorScrollbar({ scroller, revision }: { scroller: HTMLElement | null; revision: number }) {
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);
  const [pct, setPct] = useState(0);
  const [active, setActive] = useState(false); // dragging or hovering — shows the readout
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startY: number; startScroll: number; range: number } | null>(null);

  // Recompute thumb size/position from the scroller's live geometry.
  useEffect(() => {
    if (!scroller) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const overflow = scrollHeight - clientHeight;
      if (overflow <= 4 || clientHeight <= 0) {
        setThumb(null);
        return;
      }
      const thumbH = Math.max(32, (clientHeight / scrollHeight) * clientHeight);
      const top = (scrollTop / overflow) * (clientHeight - thumbH);
      setThumb({ top, height: thumbH });
      setPct(scrollTop / overflow);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", schedule);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [scroller, revision]);

  if (!scroller || !thumb) return null;

  const overflow = scroller.scrollHeight - scroller.clientHeight;
  const range = scroller.clientHeight - thumb.height; // thumb travel in px

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startScroll: scroller.scrollTop, range };
    setActive(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.range <= 0) return;
    const delta = e.clientY - d.startY;
    scroller.scrollTop = d.startScroll + (delta / d.range) * overflow;
  };
  const endDrag = () => {
    drag.current = null;
    setActive(false);
  };
  // Click/tap on the empty track jumps toward that position.
  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (e.target !== trackRef.current) return; // ignore clicks on the thumb itself
    const rect = trackRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top - thumb.height / 2;
    scroller.scrollTop = range > 0 ? (Math.max(0, Math.min(range, y)) / range) * overflow : 0;
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      className="absolute right-0 top-0 z-10 flex w-3.5 touch-none justify-center"
      style={{ height: scroller.clientHeight }}
      aria-hidden="true"
    >
      <div
        role="scrollbar"
        aria-orientation="vertical"
        aria-controls="editor-scroller"
        aria-valuenow={Math.round(pct * 100)}
        tabIndex={-1}
        onPointerDown={startDrag}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cx(
          "absolute w-1.5 cursor-grab rounded-full transition-[background-color,width] active:cursor-grabbing hover:w-2.5",
          active ? "w-2.5 bg-accent" : "bg-faint/50 hover:bg-faint",
        )}
        style={{ top: thumb.top, height: thumb.height }}
        onPointerEnter={() => setActive(true)}
        onPointerLeave={() => !drag.current && setActive(false)}
      />
      {active && (
        <span className="pointer-events-none absolute right-4 top-0 -translate-y-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-bg shadow-lg" style={{ top: thumb.top + thumb.height / 2 }}>
          {Math.round(pct * 100)}%
        </span>
      )}
    </div>
  );
}
