import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cx, uid } from "../lib/utils";
import { Icon, type IconName } from "./Icon";

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

/** Square icon-only button for toolbars. */
export function IconButton({
  label,
  name,
  size = 16,
  className,
  active,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; name: IconName; size?: number; active?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cx(
        "rounded-lg p-2 transition-colors",
        active ? "bg-accent/15 text-accent" : "text-ink-2 hover:bg-raised hover:text-ink",
        className,
      )}
      {...rest}
    >
      <Icon name={name} size={size} />
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

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-edge bg-surface" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex items-center gap-1.5 font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === o.value ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-raised",
          )}
        >
          {o.icon && <Icon name={o.icon} size={13} />}
          {o.label}
        </button>
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
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
