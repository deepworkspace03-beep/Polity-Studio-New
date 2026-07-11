import { useSyncExternalStore } from "react";
import { describeFailure, stageLabel, type FailureInfo } from "../lib/aiEngine";
import { cx } from "../lib/utils";
import { Button, Modal } from "./ui";
import { Icon } from "./Icon";

/**
 * The staged-progress dialog shown while a document is being converted by
 * Polity AI Engine (PDF/scan/image import). Mounted once in App, like
 * ImportReviewModal/CommandPalette; `showProcessing`/`updateProcessing`/
 * `succeedProcessing`/`failProcessing` are the imperative entry points
 * `components/ImportReview.tsx` drives around each engine call.
 *
 * Kept separate from lib/aiEngine.ts (which stays UI-agnostic, a pure
 * network/data layer) and from lib/importer.ts (which stays dependency-
 * free and DOM-unaware) — this is the one place that turns the engine's
 * real, reported progress into what the user sees.
 */

type Phase = "uploading" | "processing" | "done" | "failed";

interface StatusState {
  id: number;
  filename: string;
  phase: Phase;
  fraction: number;
  stage: string;
  failure: FailureInfo | null;
}

let state: StatusState | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function setState(next: StatusState | null): void {
  state = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Starts the dialog for a file about to be uploaded to the engine. */
export function showProcessing(filename: string): void {
  setState({ id: ++nextId, filename, phase: "uploading", fraction: 0, stage: "Uploading document…", failure: null });
}

/** Relays the engine's real progress (fraction 0–1, its own stage string). */
export function updateProcessing(fraction: number, stage: string): void {
  if (!state) return;
  setState({ ...state, phase: "processing", fraction, stage: stageLabel(stage) });
}

/** Briefly confirms success, then closes on its own — no extra click for
    the common case where nothing went wrong. */
export function succeedProcessing(): void {
  if (!state) return;
  setState({ ...state, phase: "done", fraction: 1, stage: "Completed successfully" });
  const id = state.id;
  setTimeout(() => {
    if (state?.id === id) setState(null);
  }, 700);
}

/** Switches to a clear, categorized error view that stays open until the
    user dismisses it — failures are never worth auto-closing. */
export function failProcessing(err: unknown): void {
  if (!state) return;
  setState({ ...state, phase: "failed", failure: describeFailure(err) });
}

export function closeProcessing(): void {
  setState(null);
}

export function ProcessingStatusModal() {
  const s = useSyncExternalStore(subscribe, () => state);
  if (!s) return null;

  if (s.phase === "failed" && s.failure) {
    return (
      <Modal open onClose={closeProcessing} title={s.failure.title}>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-danger" />
            <div className="space-y-1">
              <p className="text-sm text-ink">{s.failure.message}</p>
              <p className="truncate text-xs text-faint" title={s.filename}>
                {s.filename}
              </p>
            </div>
          </div>
          <p className="text-xs text-ink-2">
            <span className="font-semibold">Next steps: </span>
            {s.failure.suggestion}
          </p>
        </div>
        <div className="mt-4 flex justify-end border-t border-edge pt-4">
          <Button variant="primary" onClick={closeProcessing}>
            Close
          </Button>
        </div>
      </Modal>
    );
  }

  const percent = Math.round(s.fraction * 100);
  return (
    <Modal open onClose={() => {}} title="Processing document">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {s.phase === "done" ? (
            <Icon name="check" size={18} className="shrink-0 text-accent" />
          ) : (
            <Icon name="loader" size={18} className="shrink-0 animate-spin text-accent" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{s.stage}</p>
            <p className="truncate text-xs text-faint" title={s.filename}>
              {s.filename}
            </p>
          </div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
          <div
            className={cx("h-full rounded-full bg-accent transition-[width] duration-300", s.phase === "uploading" && "animate-pulse")}
            style={{ width: `${Math.max(6, percent)}%` }}
          />
        </div>
        <p className="text-xs text-faint">This can take a minute or more for scanned or multi-page documents.</p>
      </div>
    </Modal>
  );
}
