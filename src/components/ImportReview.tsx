import { useState, useSyncExternalStore } from "react";
import { createDoc } from "../lib/store";
import { IMPORT_ACCEPT, promoteLeadingTitle, stageImportFiles, type FileProcessor, type StagedDoc } from "../lib/importer";
import { ENGINE_ACCEPT, createEngineProcessor } from "../lib/aiEngine";
import { getSettings } from "../lib/store";
import type { Doc } from "../lib/types";
import { TEMPLATE_META_LIST } from "../templates/meta";
import { cx } from "../lib/utils";
import { Button, Modal, inputClass } from "./ui";
import { failProcessing, showProcessing, succeedProcessing, updateProcessing } from "./ProcessingStatus";

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

/** The configured engine processor, wrapped to drive the staged-progress
    dialog (components/ProcessingStatus.tsx) around each conversion — the
    one place a file's real upload/processing state becomes visible,
    instead of the picker just going quiet until it's done or fails. */
function engineProcessor(): FileProcessor | undefined {
  const processor = createEngineProcessor(getSettings().aiEngineUrl);
  if (!processor) return undefined;
  return {
    supports: processor.supports,
    async process(file) {
      showProcessing(file.name);
      try {
        const result = await processor.process(file, (p) => updateProcessing(p.fraction, p.stage));
        succeedProcessing();
        return result;
      } catch (err) {
        failProcessing(err);
        throw err;
      }
    },
  };
}

/** Stages files (converting + restoring backups as before) then, if
    anything is left to review, opens the modal; confirming creates the
    documents. Used by both the file picker and drag-and-drop onto the
    Library. */
export async function stageAndReview(files: File[], toast: Toast, onOpen: (doc: Doc) => void): Promise<void> {
  const staged = promoteLeadingTitle(await stageImportFiles(files, toast, engineProcessor()));
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
  // Offer engine-only formats (PDF/scan/image) in the picker only when an
  // engine is configured to handle them.
  input.accept = createEngineProcessor(getSettings().aiEngineUrl) ? `${IMPORT_ACCEPT},${ENGINE_ACCEPT}` : IMPORT_ACCEPT;
  input.onchange = () => void stageAndReview([...(input.files || [])], toast, onOpen);
  input.click();
}

/** Stages files for insertion at the editor cursor rather than as new
    documents — same conversion + review step, different destination. */
export async function stageAndReviewForInsert(files: File[], toast: Toast, onInsert: (markdown: string) => void): Promise<void> {
  const staged = await stageImportFiles(files, toast, engineProcessor());
  if (!staged.length) return;
  openImportReview(staged, "insert", (finalItems) => {
    onInsert(finalItems.map((d) => d.body).join("\n\n"));
    toast(`Inserted ${finalItems.length === 1 ? "file" : `${finalItems.length} files`} at the cursor`, "ok");
  });
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

  function patch(i: number, next: Partial<StagedDoc>) {
    setDocs((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...next } : d)));
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
