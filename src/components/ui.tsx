import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx, uid } from "../lib/utils";
import { Icon, type IconName } from "./Icon";

/* ── Focus trap ────────────────────────────────────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Traps Tab focus within `ref`'s subtree while `active`, and restores
    focus to whatever was focused before it activated once it deactivates
    — standard WCAG dialog behavior. Runs in a layout effect (not a plain
    effect) so it captures the pre-open `activeElement` before a caller's
    own "focus the panel on open" effect can move focus first; React
    flushes all layout effects, tree-wide, before any passive effects. */
export function useFocusTrap(active: boolean, ref: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (!active) return;
    const restore = document.activeElement as HTMLElement | null;
    const container = ref.current;
    if (!container) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      restore?.focus?.();
    };
  }, [active, ref]);
}

/* ── Button ────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink font-semibold hover:brightness-110",
  secondary: "bg-raised text-ink border border-edge hover:border-faint",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
  danger: "text-danger hover:bg-danger/10",
};

export function Button({
  variant = "secondary",
  icon,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: IconName }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50",
        BUTTON_STYLES[variant],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

/** Desktop gets the native `title` tooltip on hover for free; touch
    devices don't reliably show it, so a long press reveals the same
    text in a small bubble instead. Shared by IconButton and Segmented. */
export function useLongPressHint() {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    show,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        clear();
        timer.current = setTimeout(() => setShow(true), 500);
      },
      onPointerUp: () => {
        clear();
        setShow(false);
      },
      onPointerLeave: () => {
        clear();
        setShow(false);
      },
      onPointerCancel: () => {
        clear();
        setShow(false);
      },
      onContextMenu: (e: React.MouseEvent) => {
        if (show) e.preventDefault();
      },
    },
  };
}

/** Small dark bubble anchored above the trigger, shown while `show` is true. */
export function HintBubble({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-56 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-bg shadow-lg">
      {text}
    </span>
  );
}

/** Square icon-only button for toolbars. */
export function IconButton({
  label,
  name,
  size = 16,
  className,
  active,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; name: IconName; size?: number; active?: boolean }) {
  const hint = useLongPressHint();
  return (
    <button
      title={label}
      aria-label={label}
      className={cx(
        "relative rounded-lg p-2 transition-colors disabled:pointer-events-none disabled:opacity-40",
        active ? "bg-accent/15 text-accent" : "text-ink-2 hover:bg-raised hover:text-ink",
        className,
      )}
      {...hint.handlers}
      {...rest}
    >
      <Icon name={name} size={size} />
      <HintBubble show={hint.show} text={label} />
    </button>
  );
}

/* ── Form fields ───────────────────────────────────────────────────── */

export const inputClass =
  "w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left"
    >
      <span className="text-sm text-ink">{label}</span>
      <span
        className={cx(
          "relative h-5.5 w-10 flex-none rounded-full transition-colors",
          checked ? "bg-accent" : "bg-edge",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function SegmentedOption<T extends string>({
  option,
  active,
  size,
  onSelect,
}: {
  option: { value: T; label: string; icon?: IconName; hint?: string };
  active: boolean;
  size: "sm" | "md";
  onSelect: () => void;
}) {
  const longPress = useLongPressHint();
  return (
    <button
      role="radio"
      aria-checked={active}
      title={option.hint}
      onClick={onSelect}
      className={cx(
        "relative flex items-center gap-1.5 font-medium transition-colors",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        active ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-raised",
      )}
      {...(option.hint ? longPress.handlers : undefined)}
    >
      {option.icon && <Icon name={option.icon} size={13} />}
      {option.label}
      {option.hint && <HintBubble show={longPress.show} text={option.hint} />}
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string; icon?: IconName; /** Long-press (touch) / hover (desktop) description. */ hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-edge bg-surface" role="radiogroup">
      {options.map((o) => (
        <SegmentedOption key={o.value} option={o} active={value === o.value} size={size} onSelect={() => onChange(o.value)} />
      ))}
    </div>
  );
}

/* ── Modal (bottom sheet on small screens) ─────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);

  // Split from the keydown effect below: keying focus off `onClose` too
  // (as a naive exhaustive-deps effect would) re-focuses the panel on
  // every parent re-render — i.e. every keystroke in any field the modal
  // contains — which yanks focus out of the input and, on mobile, closes
  // the on-screen keyboard.
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-edge bg-surface shadow-2xl outline-none sm:rounded-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          <IconButton label="Close" name="x" onClick={onClose} />
        </header>
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/* ── File drag & drop ──────────────────────────────────────────────── */

/** Tracks a files-only drag over a container. Depth-counted so child
    enter/leave churn doesn't flicker the overlay; text drags (moving a
    selection inside the editor) are ignored. Capture-phase handlers so
    the drop never reaches CodeMirror's own file handling. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer?.types.includes("Files");
  return {
    over,
    handlers: {
      onDragEnterCapture: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current++;
        setOver(true);
      },
      onDragOverCapture: (e: React.DragEvent) => {
        if (hasFiles(e)) e.preventDefault();
      },
      onDragLeaveCapture: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      },
      onDropCapture: (e: React.DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        depth.current = 0;
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      },
    },
  };
}

export function DropOverlay({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-bg/70 backdrop-blur-[2px]">
      <div className="flex items-center gap-2.5 rounded-2xl border-2 border-dashed border-accent bg-surface px-6 py-4 text-sm font-semibold text-accent shadow-xl">
        <Icon name="upload" size={17} />
        {label}
      </div>
    </div>
  );
}

/* ── Toasts ────────────────────────────────────────────────────────── */

interface ToastItem {
  id: string;
  message: string;
  tone: "ok" | "error" | "info";
}

const ToastContext = createContext<(message: string, tone?: ToastItem["tone"]) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastItem["tone"] = "info") => {
    const id = uid();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              "pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-lg",
              t.tone === "error"
                ? "border-danger/40 bg-surface text-danger"
                : t.tone === "ok"
                  ? "border-ok/40 bg-surface text-ok"
                  : "border-edge bg-surface text-ink",
            )}
          >
            <Icon name={t.tone === "error" ? "alert" : t.tone === "ok" ? "check" : "callout"} size={15} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
