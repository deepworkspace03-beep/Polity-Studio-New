import { useMemo, useRef, useState } from "react";
import { navigate } from "../lib/router";
import { createDoc, deleteDoc, deleteDocs, duplicateDoc, mergeDocs, saveSettings, toggleFavorite, useApp } from "../lib/store";
import { contentStats, cx, estimatePages, relativeDate, sortDocs } from "../lib/utils";
import { TEMPLATE_META, TEMPLATE_META_LIST } from "../templates/meta";
import type { DemoDoc } from "../templates/demos";
import type { Doc, LibrarySort, TemplateId } from "../lib/types";
import { documentBreakdown, searchDocs, type SearchHit } from "../lib/search";
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

/** The expandable "where does this term appear?" panel shown under a search
    result. Body occurrences are grouped by heading section (reusing the
    editor's in-document scanner) and each row deep-links to the first match
    on that section's source line; title/metadata hits are summarised on top.
    The breakdown is computed on demand — only for the one open card — so a
    live search over a large library stays smooth. */
function SearchBreakdown({ doc, query, estPages, where }: { doc: Doc; query: string; estPages: number; where?: { title: number; meta: number; body: number } }) {
  const breakdown = useMemo(() => documentBreakdown(doc, query, estPages), [doc, query, estPages]);
  const fieldHits = [
    where && where.title > 0 ? `title (${where.title})` : "",
    where && where.meta > 0 ? `details (${where.meta})` : "",
    breakdown.total > 0 ? `content (${breakdown.total}${breakdown.capped ? "+" : ""})` : "",
  ].filter(Boolean);

  return (
    <div className="mt-3 rounded-lg border border-edge bg-raised/60 p-2.5" onClick={(e) => e.stopPropagation()}>
      {fieldHits.length > 0 && (
        <p className="mb-2 text-[11px] font-semibold text-ink-2">
          Found in <span className="text-accent">{fieldHits.join(" · ")}</span>
        </p>
      )}
      {breakdown.sections.length === 0 ? (
        <p className="text-[11px] text-faint">
          {breakdown.total > 0 ? "Match is in the document body." : "Match is in the title or details only."}
        </p>
      ) : (
        <ul className="max-h-52 space-y-0.5 overflow-y-auto">
          {breakdown.sections.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => navigate({ edit: doc.id, line: s.matchLine })}
                title={`Open at “${s.title || "Introduction"}” (≈ page ${s.page})`}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors hover:bg-surface"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-ink-2">
                  {s.title || <span className="italic text-faint">Introduction</span>}
                </span>
                <span className="flex-none tabular-nums text-faint">≈p{s.page}</span>
                <span className="flex-none rounded-full bg-accent/15 px-1.5 py-0.5 font-semibold tabular-nums text-accent">{s.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A document's scan-at-a-glance facts — the reason a card exists is so
    you understand the contents without opening it. Type-specific count
    surfaces the unit that matters for each document type. */
interface DocMeta {
  sig: string;
  words: number;
  pages: number;
  unit: string;
  unitCount: number;
}

/** Options grouped by field for the sort menu — a native <select> keeps
    the control compact, accessible and instantly familiar on desktop and
    tablet alike, with no bespoke popover to maintain. */
const SORT_GROUPS: { label: string; options: { value: LibrarySort; label: string }[] }[] = [
  { label: "Modified", options: [
    { value: "modified-desc", label: "Latest first" },
    { value: "modified-asc", label: "Oldest first" },
  ] },
  { label: "Created", options: [
    { value: "created-desc", label: "Latest first" },
    { value: "created-asc", label: "Oldest first" },
  ] },
  { label: "Name", options: [
    { value: "name-asc", label: "A → Z" },
    { value: "name-desc", label: "Z → A" },
  ] },
  { label: "Size", options: [
    { value: "size-desc", label: "Largest first" },
    { value: "size-asc", label: "Smallest first" },
  ] },
];

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
  // Which result card has its "where does it appear?" breakdown open. One at
  // a time keeps the grid calm and the (per-doc) breakdown scan cheap.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Content-aware: matches body text as well as title/metadata, ranked. The
  // full hits (with per-field occurrence tallies) are kept so each card can
  // show a match count and an expandable breakdown of where the term appears.
  const hits = useMemo(() => (query.trim() ? searchDocs(docs, query, 200) : null), [docs, query]);
  const hitById = useMemo(() => {
    const m = new Map<string, SearchHit>();
    if (hits) for (const h of hits) m.set(h.doc.id, h);
    return m;
  }, [hits]);
  // A single at-a-glance tally above the result list — total occurrences
  // across every matched document — so the reader sees the search's overall
  // weight before scanning the per-document cards below.
  const matchTotal = useMemo(() => (hits ? hits.reduce((n, h) => n + (h.matchCount ?? 0), 0) : 0), [hits]);

  // Search results keep their relevance ranking (order the query decides);
  // otherwise the chosen sort applies across all fields + directions.
  const filtered = useMemo(() => {
    const base = hits ? hits.map((h) => h.doc) : docs;
    const typed = templateFilter === "all" ? base : base.filter((d) => d.template === templateFilter);
    return hits ? typed : sortDocs(typed, settings.librarySort);
  }, [docs, hits, templateFilter, settings.librarySort]);

  const favorites = useMemo(() => docs.filter((d) => d.favorite).sort((a, b) => b.updatedAt - a.updatedAt), [docs]);

  // Card metadata is derived from a full body scan (contentStats +
  // estimatePages), so it's cached per document and only recomputed when
  // that document actually changes — keeps the grid smooth while typing a
  // search or re-sorting a large library. One entry per doc (bounded).
  const metaCache = useRef(new Map<string, DocMeta>());
  const metaFor = (doc: Doc): DocMeta => {
    const l = doc.layout;
    const sig = `${doc.updatedAt}:${doc.body.length}:${l.density}:${l.cover}:${l.toc}:${doc.template}`;
    const hit = metaCache.current.get(doc.id);
    if (hit && hit.sig === sig) return hit;
    const stats = contentStats(doc.body);
    const pages = estimatePages(
      stats,
      l.density,
      !!l.cover,
      !!(TEMPLATE_META[doc.template].hasToc && l.toc && stats.headings > 0),
      doc.template,
    );
    const [unit, unitCount] =
      doc.template === "questions"
        ? ["questions", stats.questions]
        : doc.template === "notes"
          ? ["chapters", stats.h1s]
          : ["sections", stats.headings];
    const meta: DocMeta = { sig, words: stats.words, pages, unit, unitCount };
    metaCache.current.set(doc.id, meta);
    return meta;
  };

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

  /** Open a document. When it was clicked from a search result that has a
      body match, deep-link to that first match's line (#/edit/:id/:line) so
      the editor opens scrolled to the term, centred and highlighted, rather
      than at the top. Title/metadata-only hits (no body line) just open. */
  function openDoc(doc: Doc, hit?: SearchHit) {
    navigate(hit?.line ? { edit: doc.id, line: hit.line } : { edit: doc.id });
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
      // Question Bank demos pin the answers mode they were written to
      // show off (inline study layout vs back-of-book key).
      ...(demo.answers ? { layout: { ...settings.newDocLayout, answers: demo.answers } } : {}),
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

      {/* The Homepage is a workspace, not a landing page: it opens straight
          on the documents. A single action row (create/import/examples)
          sits above the library — no greeting, no promo copy. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-extrabold tracking-tight">
          Library
          {docs.length > 0 && <span className="ml-2 text-sm font-semibold text-faint">{docs.length}</span>}
        </h1>
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

      {/* Search + sort share one row so finding and ordering feel like one
          workflow. Search appears once the library is worth searching. */}
      {docs.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {docs.length > 3 && (
            <div className="relative min-w-[12rem] flex-1">
              <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setExpandedId(null);
                }}
                placeholder="Search titles, content & metadata…"
                className="w-full rounded-xl border border-edge bg-surface py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-faint focus:border-accent"
              />
            </div>
          )}
          {!query.trim() && (
            <div className="relative ml-auto flex items-center">
              <Icon name="sort" size={14} className="pointer-events-none absolute left-2.5 text-faint" />
              <select
                aria-label="Sort documents"
                value={settings.librarySort}
                onChange={(e) => saveSettings({ librarySort: e.target.value as LibrarySort })}
                className="cursor-pointer appearance-none rounded-lg border border-edge bg-surface py-2 pl-8 pr-8 text-xs font-semibold text-ink-2 outline-none focus:border-accent"
              >
                {SORT_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {g.label} · {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <Icon name="chevronDown" size={14} className="pointer-events-none absolute right-2.5 text-faint" />
            </div>
          )}
        </div>
      )}

      {/* Favourites — quick access to starred documents, one tap away. */}
      {favorites.length > 0 && !query.trim() && !selectMode && (
        <section className="mb-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">
            <Icon name="star" size={12} className="fill-current text-warn" />
            Favourites
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {favorites.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate({ edit: d.id })}
                className="inline-flex max-w-64 items-center gap-1.5 rounded-full border border-edge bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-accent hover:text-ink"
              >
                <TemplateGlyph id={d.template} className="h-3 w-3 flex-none" />
                <span className="truncate">{d.title || "Untitled"}</span>
              </button>
            ))}
          </div>
        </section>
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
        <>
        {/* Search summary — a compact tally of the whole result set, set
            apart from the per-document cards below. Shown only while a search
            is active and something matched. */}
        {hits && matchTotal > 0 && (
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
            <Icon name="search" size={13} className="flex-none text-accent" />
            <span className="tabular-nums text-accent">{matchTotal.toLocaleString()}</span>
            {matchTotal === 1 ? "match" : "matches"} across
            <span className="tabular-nums text-accent">{filtered.length.toLocaleString()}</span>
            {filtered.length === 1 ? "document" : "documents"}
          </p>
        )}
        <ul className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => {
            const meta = metaFor(doc);
            const template = TEMPLATE_META[doc.template];
            const isSelected = selected.has(doc.id);
            const hit = hitById.get(doc.id);
            const isExpanded = expandedId === doc.id;
            return (
              <li key={doc.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => (selectMode ? toggleSelected(doc.id) : openDoc(doc, hit))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (selectMode) toggleSelected(doc.id);
                    else openDoc(doc, hit);
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
                      /* pointer-fine (mouse/trackpad): actions reveal on hover
                         or keyboard focus. Coarse pointers (Android tablets,
                         phones) have no hover, so the actions stay visible —
                         hiding them behind hover made Delete/Duplicate
                         unreachable on touch devices. A starred document's
                         star is always visible everywhere. */
                      <span
                        className={cx(
                          "flex gap-0.5 transition-opacity",
                          !doc.favorite && "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100",
                        )}
                      >
                        <IconButton
                          label={doc.favorite ? "Remove from favourites" : "Add to favourites"}
                          name="star"
                          size={14}
                          className={cx("p-1.5", doc.favorite ? "text-warn" : "hover:text-warn")}
                          iconClassName={doc.favorite ? "fill-current" : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(doc.id);
                          }}
                        />
                        <span
                          className={cx(
                            "flex gap-0.5 transition-opacity",
                            doc.favorite && "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100",
                          )}
                        >
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
                      </span>
                    )}
                  </div>
                  <h3 className="truncate text-sm font-bold">{doc.title || "Untitled"}</h3>
                  {/* Scan-at-a-glance facts: the exam-ready size (≈ final
                      pages), the type-specific unit that matters, and word
                      count — so the contents are legible without opening. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-ink-2">
                    <span className="inline-flex items-center gap-1 tabular-nums" title="Estimated final PDF pages">
                      <Icon name="file" size={11} className="text-faint" />≈{meta.pages}p
                    </span>
                    {meta.unitCount > 0 && (
                      <span className="tabular-nums text-faint">
                        {meta.unitCount.toLocaleString()} {meta.unit}
                      </span>
                    )}
                    <span className="tabular-nums text-faint">{meta.words.toLocaleString()} words</span>
                  </div>
                  <p
                    className="mt-1 text-[11px] text-faint"
                    title={`Created ${new Date(doc.createdAt).toLocaleString()} · Modified ${new Date(doc.updatedAt).toLocaleString()}`}
                  >
                    Edited {relativeDate(doc.updatedAt)}
                  </p>
                  {hit && !selectMode && (hit.matchCount ?? 0) > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId((cur) => (cur === doc.id ? null : doc.id));
                      }}
                      aria-expanded={isExpanded}
                      className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-edge bg-raised/40 px-2 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-accent hover:text-accent"
                    >
                      <Icon name="search" size={11} className="flex-none" />
                      <span className="tabular-nums">
                        {hit.matchCount} match{hit.matchCount === 1 ? "" : "es"}
                      </span>
                      <span className="flex-1" />
                      <Icon name="chevronDown" size={13} className={cx("flex-none transition-transform", isExpanded && "rotate-180")} />
                    </button>
                  )}
                  {hit && isExpanded && !selectMode && (
                    <SearchBreakdown doc={doc} query={query} estPages={meta.pages} where={hit.where} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        </>
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
