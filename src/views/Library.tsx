import { useMemo, useState } from "react";
import { navigate } from "../lib/router";
import { createDoc, deleteDoc, deleteDocs, duplicateDoc, mergeDocs, saveSettings, useApp } from "../lib/store";
import { contentStats, cx, relativeDate } from "../lib/utils";
import { TEMPLATE_META, TEMPLATE_META_LIST } from "../templates/meta";
import type { DemoDoc } from "../templates/demos";
import type { TemplateId } from "../lib/types";
import { searchDocs } from "../lib/search";
import { pickAndImportFiles, stageAndReview } from "../components/ImportReview";
import { Button, DropOverlay, IconButton, Modal, useFileDrop, useToast } from "../components/ui";
import { Icon, TempleMark } from "../components/Icon";
import { openPalette } from "../components/CommandPalette";
import { StudioNav } from "../components/StudioNav";

function TemplateGlyph({ id, className }: { id: TemplateId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <g dangerouslySetInnerHTML={{ __html: TEMPLATE_META[id].icon }} />
    </svg>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Library() {
  const { docs, settings } = useApp();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [templateFilter, setTemplateFilter] = useState<TemplateId | "all">("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  // Example content is 750+ lines of showcase text with no other reason to
  // be in the initial bundle — load it only the first time Examples opens.
  const [demos, setDemos] = useState<DemoDoc[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Content-aware: matches body text as well as title/metadata, ranked.
  const filtered = useMemo(() => {
    const q = query.trim();
    const base = q ? searchDocs(docs, q, 200).map((h) => h.doc) : docs;
    return templateFilter === "all" ? base : base.filter((d) => d.template === templateFilter);
  }, [docs, query, templateFilter]);

  // Only worth showing the type filter once the library actually mixes
  // document types — a single-type library has nothing to filter.
  const templatesInUse = useMemo(() => {
    const present = new Set(docs.map((d) => d.template));
    return TEMPLATE_META_LIST.filter((t) => present.has(t.id));
  }, [docs]);

  const drop = useFileDrop((files) => stageAndReview(files, toast, (doc) => navigate({ edit: doc.id })));

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    deleteDocs([...selected]);
    toast(`Deleted ${selected.size} document${selected.size === 1 ? "" : "s"}`, "info");
    setConfirmBulkDelete(false);
    exitSelectMode();
  }

  function handleMerge() {
    // Merge order should follow what's on screen, not Set insertion order.
    const orderedIds = filtered.map((d) => d.id).filter((id) => selected.has(id));
    const merged = mergeDocs(orderedIds);
    if (!merged) return;
    exitSelectMode();
    navigate({ edit: merged.id });
  }

  function handleCreate(template: TemplateId) {
    const t = TEMPLATE_META[template];
    const doc = createDoc({ template, title: t.starterTitle, body: t.starter });
    setPickerOpen(false);
    navigate({ edit: doc.id });
  }

  function openExamples() {
    setExamplesOpen(true);
    if (!demos) void import("../templates/demos").then((m) => setDemos(m.DEMOS));
  }

  function handleOpenExample(demo: DemoDoc) {
    const doc = createDoc({
      template: demo.template,
      title: demo.title,
      body: demo.body,
      subtitle: demo.subtitle,
      paper: demo.paper,
    });
    setExamplesOpen(false);
    navigate({ edit: doc.id });
  }

  const isDark = settings.theme === "dark" || (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8" {...drop.handlers}>
      <DropOverlay show={drop.over} label="Drop files to import as documents" />
      <header className="mb-8 flex items-center gap-2.5">
        <TempleMark size={26} className="flex-none text-accent" />
        <span className="min-w-0 truncate text-[15px] font-extrabold tracking-tight">Polity Studio</span>
        <span className="flex-1" />
        <IconButton label="Search everything (Ctrl+K)" name="search" size={18} onClick={openPalette} />
        <StudioNav home={false} />
        {docs.length > 0 &&
          (selectMode ? (
            <Button onClick={exitSelectMode}>Cancel</Button>
          ) : (
            <IconButton label="Select documents" name="checklist" size={18} onClick={() => setSelectMode(true)} />
          ))}
        <IconButton label="Markdown guide & help" name="help" size={18} onClick={() => navigate("help")} />
        <IconButton
          label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          name={isDark ? "sun" : "moon"}
          size={18}
          onClick={() => saveSettings({ theme: isDark ? "light" : "dark" })}
        />
        <IconButton label="Settings" name="settings" size={18} onClick={() => navigate("settings")} />
      </header>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[27px]">{greeting()}</h1>
          <p className="mt-1.5 max-w-md text-sm text-faint">
            Turn your Markdown into a beautifully branded, exam-ready PDF.
          </p>
        </div>
        <div className="flex flex-none flex-wrap gap-2">
          <Button icon="upload" onClick={() => pickAndImportFiles(toast, (doc) => navigate({ edit: doc.id }))}>
            Import
          </Button>
          <Button icon="eye" onClick={openExamples}>
            Examples
          </Button>
          <Button variant="primary" icon="plus" onClick={() => setPickerOpen(true)}>
            New document
          </Button>
        </div>
      </div>

      {docs.length > 3 && (
        <div className="relative mb-4">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, content & metadata…"
            className="w-full rounded-xl border border-edge bg-surface py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
      )}

      {templatesInUse.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by document type">
          <button
            onClick={() => setTemplateFilter("all")}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              templateFilter === "all" ? "bg-accent text-accent-ink" : "bg-raised text-ink-2 hover:text-ink",
            )}
          >
            All
          </button>
          {templatesInUse.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplateFilter((cur) => (cur === t.id ? "all" : t.id))}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                templateFilter === t.id ? "bg-accent text-accent-ink" : "bg-raised text-ink-2 hover:text-ink",
              )}
            >
              <TemplateGlyph id={t.id} className="h-3 w-3" />
              {t.name}
            </button>
          ))}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-edge px-6 py-16 text-center">
          <TempleMark size={44} className="mb-4 text-accent/70" />
          <h3 className="text-base font-bold">Your studio is empty</h3>
          <p className="mt-1 max-w-sm text-sm text-faint">
            Create your first document and turn raw notes into an exam-ready PDF in minutes — paste straight from
            Word, Google Docs or an AI chat, drop .md / .txt / .html files anywhere on this screen, or open an example.
          </p>
          <div className="mt-5 flex gap-2">
            <Button icon="eye" onClick={openExamples}>
              Browse examples
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setPickerOpen(true)}>
              Create your first document
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint">
          {query ? `No documents match “${query}”.` : "No documents of this type."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => {
            const stats = contentStats(doc.body);
            const template = TEMPLATE_META[doc.template];
            const isSelected = selected.has(doc.id);
            return (
              <li key={doc.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => (selectMode ? toggleSelected(doc.id) : navigate({ edit: doc.id }))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (selectMode) toggleSelected(doc.id);
                    else navigate({ edit: doc.id });
                  }}
                  className={cx(
                    "group relative cursor-pointer rounded-xl border bg-surface p-4 transition-colors",
                    isSelected ? "border-accent ring-1 ring-accent" : "border-edge hover:border-accent",
                  )}
                >
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-2.5 py-1 text-[11px] font-semibold text-ink-2">
                      <TemplateGlyph id={doc.template} className="h-3 w-3" />
                      {template.name}
                    </span>
                    {selectMode ? (
                      <span
                        className={cx(
                          "flex h-5 w-5 flex-none items-center justify-center rounded-full border-2",
                          isSelected ? "border-accent bg-accent text-accent-ink" : "border-edge text-transparent",
                        )}
                        aria-hidden="true"
                      >
                        <Icon name="check" size={12} />
                      </span>
                    ) : (
                      <span className={cx("flex gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100", "opacity-100")}>
                        <IconButton
                          label="Duplicate"
                          name="copy"
                          size={14}
                          className="p-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            const copy = duplicateDoc(doc.id);
                            if (copy) toast("Duplicated", "ok");
                          }}
                        />
                        <IconButton
                          label="Delete"
                          name="trash"
                          size={14}
                          className="p-1.5 hover:text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete({ id: doc.id, title: doc.title });
                          }}
                        />
                      </span>
                    )}
                  </div>
                  <h3 className="truncate text-sm font-bold">{doc.title || "Untitled"}</h3>
                  <p className="mt-1 text-xs text-faint">
                    {relativeDate(doc.updatedAt)} · {stats.words.toLocaleString()} words
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectMode && (
        <div className="sticky bottom-0 -mx-4 mt-auto flex items-center gap-3 border-t border-edge bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
          <span className="text-sm font-medium text-ink-2">
            {selected.size} selected
          </span>
          <span className="flex-1" />
          <Button icon="merge" disabled={selected.size < 2} onClick={handleMerge}>
            Merge
          </Button>
          <Button
            variant="danger"
            icon="trash"
            disabled={selected.size === 0}
            onClick={() => setConfirmBulkDelete(true)}
          >
            Delete
          </Button>
        </div>
      )}

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="What are you creating?" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TEMPLATE_META_LIST.map((t) => (
            <button
              key={t.id}
              onClick={() => handleCreate(t.id)}
              className="flex flex-col items-start gap-2 rounded-xl border border-edge p-4 text-left transition-colors hover:border-accent hover:bg-raised"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <TemplateGlyph id={t.id} className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-bold">{t.name}</span>
              <span className="text-xs text-faint">{t.description}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={examplesOpen} onClose={() => setExamplesOpen(false)} title="Example documents" wide>
        <p className="mb-4 text-sm text-faint">
          Real study material that shows off tables, callouts, footnotes, highlights, MCQ metadata and more. Each opens
          as a fresh document in your library — edit or delete it freely.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {demos === null ? (
            <p className="col-span-full py-8 text-center text-sm text-faint">Loading examples…</p>
          ) : (
            demos.map((demo) => (
            <button
              key={demo.id}
              onClick={() => handleOpenExample(demo)}
              className="flex flex-col items-start gap-2 rounded-xl border border-edge p-4 text-left transition-colors hover:border-accent hover:bg-raised"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-2.5 py-1 text-[11px] font-semibold text-ink-2">
                <TemplateGlyph id={demo.template} className="h-3 w-3" />
                {TEMPLATE_META[demo.template].name}
              </span>
              <span className="text-sm font-bold">{demo.title}</span>
              <span className="text-xs text-faint">{demo.description}</span>
            </button>
            ))
          )}
        </div>
      </Modal>

      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete document?">
        <p className="text-sm text-ink-2">
          “{confirmDelete?.title || "Untitled"}” will be permanently deleted. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            variant="primary"
            className="bg-danger text-white"
            onClick={() => {
              if (confirmDelete) deleteDoc(confirmDelete.id);
              setConfirmDelete(null);
              toast("Document deleted", "info");
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>

      <Modal open={confirmBulkDelete} onClose={() => setConfirmBulkDelete(false)} title="Delete documents?">
        <p className="text-sm text-ink-2">
          {selected.size} document{selected.size === 1 ? "" : "s"} will be permanently deleted. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmBulkDelete(false)}>Cancel</Button>
          <Button variant="primary" className="bg-danger text-white" onClick={handleBulkDelete}>
            Delete {selected.size}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
