import { useMemo, useState, useSyncExternalStore } from "react";
import { createDoc } from "../lib/store";
import { IMPORT_ACCEPT, promoteLeadingTitle, stageImportFiles, type StagedDoc } from "../lib/importer";
import { normalizeMarkdown, reviewHeadline, reviewMarkdown } from "../lib/markdownReview";
import type { Doc } from "../lib/types";
import { TEMPLATE_META_LIST } from "../templates/meta";
import { cx } from "../lib/utils";
import { Button, Modal, inputClass } from "./ui";

/**
 * Import Review — the checkpoint between "a file landed" and "a document
 * exists". Smart Paste stays instant (it's one undoable CodeMirror
 * transaction, already reversible with Ctrl+Z); file-based import is
 * heavier — multiple files, unfamiliar formatting, DOCX's inherently
 * lossy conversion — so it earns a confirm-or-edit step showing exactly
 * what was detected before anything is written to the library.
 *
 * Mounted once in App (like CommandPalette); `pickAndImportFiles` and
 * `stageAndReview` are the two entry points other views call.
 */

type Toast = (message: string, tone?: "ok" | "error" | "info") => void;
type Mode = "create" | "insert";

interface ReviewState {
  id: number;
  items: StagedDoc[];
  mode: Mode;
  onConfirm: (items: StagedDoc[]) => void;
}

let state: ReviewState | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function setState(next: ReviewState | null): void {
  state = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function openImportReview(items: StagedDoc[], mode: Mode, onConfirm: (items: StagedDoc[]) => void): void {
  if (!items.length) return;
  setState({ id: ++nextId, items, mode, onConfirm });
}

/** Stages files (converting + restoring backups as before) then, if
    anything is left to review, opens the modal; confirming creates the
    documents. Used by both the file picker and drag-and-drop onto the
    Library. */
export async function stageAndReview(files: File[], toast: Toast, onOpen: (doc: Doc) => void): Promise<void> {
  const staged = promoteLeadingTitle(await stageImportFiles(files, toast));
  if (!staged.length) return;
  openImportReview(staged, "create", (finalItems) => {
    const created = finalItems.map((d) => createDoc({ template: d.template, title: d.title || "Untitled", body: d.body }));
    toast(`Imported ${created.length === 1 ? `“${created[0].title}”` : `${created.length} documents`}`, "ok");
    if (created.length === 1) onOpen(created[0]);
  });
}

/** Opens the OS file picker, then reviews the result. */
export function pickAndImportFiles(toast: Toast, onOpen: (doc: Doc) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = IMPORT_ACCEPT;
  input.onchange = () => void stageAndReview([...(input.files || [])], toast, onOpen);
  input.click();
}

/** Stages files for insertion at the editor cursor rather than as new
    documents — same conversion + review step, different destination. */
export async function stageAndReviewForInsert(files: File[], toast: Toast, onInsert: (markdown: string) => void): Promise<void> {
  const staged = await stageImportFiles(files, toast);
  if (!staged.length) return;
  openImportReview(staged, "insert", (finalItems) => {
    onInsert(finalItems.map((d) => d.body).join("\n\n"));
    toast(`Inserted ${finalItems.length === 1 ? "file" : `${finalItems.length} files`} at the cursor`, "ok");
  });
}

function Stat({ label }: { label: string }) {
  return <span className="whitespace-nowrap tabular-nums">{label}</span>;
}

export function ImportReviewModal() {
  const s = useSyncExternalStore(subscribe, () => state);
  if (!s) return null;
  return <ReviewBody key={s.id} items={s.items} mode={s.mode} onConfirm={s.onConfirm} />;
}

function ReviewBody({ items, mode, onConfirm }: { items: StagedDoc[]; mode: Mode; onConfirm: (items: StagedDoc[]) => void }) {
  const [docs, setDocs] = useState(items);
  const [active, setActive] = useState(0);
  const current = docs[active];
  const review = useMemo(() => reviewMarkdown(current.body), [current.body]);

  function patch(i: number, next: Partial<StagedDoc>) {
    setDocs((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...next } : d)));
  }

  function normalize() {
    patch(active, { body: normalizeMarkdown(current.body).markdown });
  }

  function close() {
    setState(null);
  }

  const title = mode === "insert" ? `Review before inserting ${docs.length > 1 ? `${docs.length} files` : "at the cursor"}` : `Review ${docs.length} import${docs.length === 1 ? "" : "s"}`;

  return (
    <Modal open onClose={close} title={title} wide>
      <div className="flex flex-col gap-3 sm:h-[58vh] sm:flex-row">
        {docs.length > 1 && (
          <ul className="flex flex-row gap-1 overflow-x-auto sm:w-40 sm:flex-none sm:flex-col sm:overflow-y-auto sm:pr-1">
            {docs.map((d, i) => (
              <li key={i} className="flex-none">
                <button
                  onClick={() => setActive(i)}
                  className={cx(
                    "block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs font-medium",
                    i === active ? "bg-raised text-ink" : "text-faint hover:text-ink-2",
                  )}
                >
                  {d.title || "Untitled"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {mode === "create" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={current.title}
                onChange={(e) => patch(active, { title: e.target.value })}
                className={cx(inputClass, "sm:flex-1")}
                placeholder="Document title"
                aria-label="Document title"
              />
              <select
                value={current.template}
                onChange={(e) => patch(active, { template: e.target.value as StagedDoc["template"] })}
                className={cx(inputClass, "sm:w-44")}
                aria-label="Document type"
              >
                {TEMPLATE_META_LIST.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-faint">{current.summary}</p>
          <p className={cx("text-[11px] font-semibold", review.warnings.length ? "text-warn" : review.fixable ? "text-ink-2" : "text-ok")}>
            {reviewHeadline(review)}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
            <Stat label={`${review.words.toLocaleString()} words`} />
            <Stat label={`${review.readingMinutes} min read`} />
            <Stat label={`~${review.pages} ${review.pages === 1 ? "page" : "pages"}`} />
            {review.headings > 0 && <Stat label={`${review.headings} headings`} />}
            {review.tables > 0 && <Stat label={`${review.tables} tables`} />}
            {review.images > 0 && <Stat label={`${review.images} images`} />}
            {review.links > 0 && <Stat label={`${review.links} links`} />}
            {review.codeBlocks > 0 && <Stat label={`${review.codeBlocks} code`} />}
            {review.fixable > 0 && (
              <button
                onClick={normalize}
                className="rounded-full bg-raised px-2 py-0.5 font-medium text-ink-2 hover:text-ink"
                title="Fix heading spacing, stray whitespace and blank lines"
              >
                Normalize · {review.fixable} {review.fixable === 1 ? "fix" : "fixes"}
              </button>
            )}
          </div>
          {review.warnings.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-[11px] text-amber-600 dark:text-amber-500">
              {review.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
          <textarea
            value={current.body}
            onChange={(e) => patch(active, { body: e.target.value })}
            className={cx(inputClass, "min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed")}
            spellCheck={false}
            aria-label="Converted Markdown"
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-edge pt-4">
        <Button onClick={close}>Cancel</Button>
        <Button
          variant="primary"
          icon="check"
          onClick={() => {
            onConfirm(docs);
            close();
          }}
        >
          {mode === "insert" ? "Insert" : `Import ${docs.length}`}
        </Button>
      </div>
    </Modal>
  );
}
