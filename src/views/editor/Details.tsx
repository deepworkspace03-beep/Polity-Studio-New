import { useEffect, useMemo, useRef } from "react";
import type { Doc, DocLayout } from "../../lib/types";
import { useApp } from "../../lib/store";
import { TEMPLATE_META } from "../../templates/meta";
import { parseMcq, validateMcq } from "../../markdown/mcq";
import { Field, IconButton, Segmented, Toggle, inputClass } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { cx } from "../../lib/utils";

const COVER_STYLES: { id: DocLayout["coverStyle"]; label: string; swatch: string }[] = [
  { id: "regal", label: "Regal", swatch: "linear-gradient(140deg,#0d1930,#1d3357 60%,#c9bc9e 175%)" },
  { id: "aurora", label: "Aurora", swatch: "linear-gradient(140deg,#123c93,#0d76b2 52%,#0a9f80)" },
  { id: "ivory", label: "Ivory", swatch: "linear-gradient(140deg,#f7f2e6 70%,#b1832c 180%)" },
  { id: "midnight", label: "Midnight", swatch: "linear-gradient(140deg,#141f2e,#1b2b41 60%,#48e0bd 190%)" },
];

/** The settings form itself — shared verbatim by the mobile modal and the
    desktop pane so the two stay in lockstep with zero duplicated markup. */
function DetailsFields({ doc, onChange }: { doc: Doc; onChange: (patch: Partial<Doc>) => void }) {
  const { brand } = useApp();
  const template = TEMPLATE_META[doc.template];
  const layout = (patch: Partial<DocLayout>) => onChange({ layout: { ...doc.layout, ...patch } });

  const mcqIssues = useMemo(() => {
    if (doc.template !== "mcq") return [];
    return validateMcq(parseMcq(doc.body));
  }, [doc.template, doc.body]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-faint">Publication</h3>
        <Field label="Subtitle">
          <input className={inputClass} value={doc.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} placeholder="Shown under the title on the cover" />
        </Field>
        <Field label="Exam">
          <input className={inputClass} list="exam-options" value={doc.exam} onChange={(e) => onChange({ exam: e.target.value })} placeholder="e.g. UGC-NET Political Science" />
          <datalist id="exam-options">
            {brand.exams.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paper / Unit">
            <input className={inputClass} value={doc.paper} onChange={(e) => onChange({ paper: e.target.value })} placeholder="Paper 2 · Unit 1" />
          </Field>
          <Field label="Session / Edition">
            <input className={inputClass} value={doc.session} onChange={(e) => onChange({ session: e.target.value })} placeholder="2026" />
          </Field>
        </div>
        <Field label="Author">
          <input className={inputClass} value={doc.author} onChange={(e) => onChange({ author: e.target.value })} />
        </Field>
        <Field label="Language">
          <Segmented
            value={doc.lang}
            onChange={(lang) => onChange({ lang })}
            options={[
              { value: "en", label: "English" },
              { value: "hi", label: "हिन्दी" },
            ]}
          />
        </Field>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-faint">Layout & PDF</h3>
        <Toggle label="Cover page" checked={doc.layout.cover} onChange={(v) => layout({ cover: v })} />
        {doc.layout.cover && (
          <div className="grid grid-cols-2 gap-2">
            {COVER_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => layout({ coverStyle: s.id })}
                className={cx(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-1.5 text-[11px] font-semibold",
                  doc.layout.coverStyle === s.id ? "border-accent text-accent" : "border-edge text-ink-2 hover:border-faint",
                )}
              >
                <span className="h-10 w-full rounded-md border border-black/10" style={{ background: s.swatch }} />
                {s.label}
              </button>
            ))}
          </div>
        )}
        {template.hasToc && <Toggle label="Table of contents" checked={doc.layout.toc} onChange={(v) => layout({ toc: v })} />}
        <Toggle label="Watermark on every page" checked={doc.layout.watermark} onChange={(v) => layout({ watermark: v })} />
        {template.hasAnswers && (
          <Field label="Answers & explanations">
            <Segmented
              value={doc.layout.answers}
              onChange={(answers) => layout({ answers })}
              options={[
                { value: "end", label: "At the end" },
                { value: "inline", label: "Inline" },
                { value: "none", label: "Hidden" },
              ]}
            />
          </Field>
        )}
        <Field label="Page size">
          <Segmented
            value={doc.layout.pageSize}
            onChange={(pageSize) => layout({ pageSize })}
            options={[
              { value: "a4", label: "A4" },
              { value: "a5", label: "A5" },
              { value: "letter", label: "Letter" },
            ]}
          />
        </Field>
        <Field label="Text density">
          <Segmented
            value={doc.layout.density}
            onChange={(density) => layout({ density })}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfort", label: "Comfort" },
              { value: "relaxed", label: "Relaxed" },
            ]}
          />
        </Field>
      </div>

      {mcqIssues.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-edge bg-raised p-4">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-faint">Booklet check</h3>
          {mcqIssues.slice(0, 8).map((issue, i) => (
            <p key={i} className={cx("flex items-start gap-2 text-xs", issue.level === "error" ? "text-danger" : issue.level === "warning" ? "text-warn" : "text-faint")}>
              <Icon name={issue.level === "info" ? "callout" : "alert"} size={13} className="mt-0.5 flex-none" />
              {issue.message}
            </p>
          ))}
          {mcqIssues.length > 8 && <p className="text-xs text-faint">…and {mcqIssues.length - 8} more.</p>}
        </div>
      )}
    </div>
  );
}

/** Mobile / narrow-screen: a slide-over modal (hidden once the desktop
    pane below takes over at the `md` breakpoint). */
export function Details({
  open,
  onClose,
  doc,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  doc: Doc;
  onChange: (patch: Partial<Doc>) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focusing the panel must only happen when it *opens* — keying this off
  // `onClose` too (as a naive exhaustive-deps effect would) re-focuses the
  // panel div on every parent re-render, i.e. on every keystroke in any
  // field below, which yanks focus out of whatever input the author was
  // typing in and (on mobile) dismisses the on-screen keyboard.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
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
    <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Document details">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-xs flex-col border-r border-edge bg-surface shadow-2xl outline-none sm:max-w-sm"
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
          <h2 className="text-sm font-bold text-ink">Document details</h2>
          <IconButton label="Close" name="x" onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <DetailsFields doc={doc} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

/** Desktop / tablet (`md` and up): the settings pane docked to the left of
    the workspace, persistent and resizable like the editor and preview
    panes beside it. */
export function DetailsPane({
  doc,
  onChange,
  onCollapse,
}: {
  doc: Doc;
  onChange: (patch: Partial<Doc>) => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex flex-none items-center justify-between gap-2 border-b border-edge px-4 py-2.5">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-faint">Settings</h2>
        <IconButton label="Collapse settings panel" name="chevronLeft" size={14} onClick={onCollapse} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <DetailsFields doc={doc} onChange={onChange} />
      </div>
    </div>
  );
}
