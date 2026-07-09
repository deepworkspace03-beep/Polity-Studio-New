import { useMemo, useState } from "react";
import { navigate } from "../lib/router";
import { createDoc, deleteDoc, duplicateDoc, useApp } from "../lib/store";
import { contentStats, cx, relativeDate } from "../lib/utils";
import { TEMPLATE_META, TEMPLATE_META_LIST } from "../templates/meta";
import { DEMOS, type DemoDoc } from "../templates/demos";
import type { TemplateId } from "../lib/types";
import { Button, IconButton, Modal, useToast } from "../components/ui";
import { Icon, TempleMark } from "../components/Icon";

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
  const { docs, brand } = useApp();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => (d.title + " " + d.exam + " " + d.subtitle).toLowerCase().includes(q));
  }, [docs, query]);

  function handleCreate(template: TemplateId) {
    const t = TEMPLATE_META[template];
    const doc = createDoc({ template, title: t.starterTitle, body: t.starter });
    setPickerOpen(false);
    navigate({ edit: doc.id });
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

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1C3557] to-[#149C94] text-white">
          <TempleMark size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold tracking-tight">Polity Studio</h1>
          <p className="truncate text-xs text-faint">{brand.name} · {brand.initiative}</p>
        </div>
        <IconButton label="Settings" name="settings" size={19} onClick={() => navigate("settings")} />
      </header>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{greeting()}</h2>
          <p className="mt-0.5 text-sm text-faint">Paste your Markdown, get a beautiful branded PDF.</p>
        </div>
        <div className="flex gap-2">
          <Button icon="eye" onClick={() => setExamplesOpen(true)}>
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
            placeholder="Search documents…"
            className="w-full rounded-xl border border-edge bg-surface py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-faint focus:border-accent"
          />
        </div>
      )}

      {docs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-edge px-6 py-16 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <TempleMark size={30} />
          </span>
          <h3 className="text-base font-bold">Your studio is empty</h3>
          <p className="mt-1 max-w-sm text-sm text-faint">
            Create your first document and turn raw notes into an exam-ready PDF in minutes — or open an example to see
            what the studio can do.
          </p>
          <div className="mt-5 flex gap-2">
            <Button icon="eye" onClick={() => setExamplesOpen(true)}>
              Browse examples
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setPickerOpen(true)}>
              Create your first document
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-faint">No documents match “{query}”.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => {
            const stats = contentStats(doc.body);
            const template = TEMPLATE_META[doc.template];
            return (
              <li key={doc.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate({ edit: doc.id })}
                  onKeyDown={(e) => e.key === "Enter" && navigate({ edit: doc.id })}
                  className="group cursor-pointer rounded-xl border border-edge bg-surface p-4 transition-colors hover:border-accent"
                >
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-raised px-2.5 py-1 text-[11px] font-semibold text-ink-2">
                      <TemplateGlyph id={doc.template} className="h-3 w-3" />
                      {template.name}
                    </span>
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
          {DEMOS.map((demo) => (
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
          ))}
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
    </div>
  );
}
