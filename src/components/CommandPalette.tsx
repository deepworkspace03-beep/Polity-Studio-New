import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../lib/router";
import { createDoc, exportBackup, saveSettings, useApp } from "../lib/store";
import { searchDocs, type SearchHit } from "../lib/search";
import { pickAndImportFiles } from "../lib/importer";
import { cx, downloadFile, relativeDate } from "../lib/utils";
import { TEMPLATE_META, TEMPLATE_META_LIST } from "../templates/meta";
import type { Doc } from "../lib/types";
import { Icon, type IconName } from "./Icon";
import { useToast } from "./ui";

/**
 * Global search & command palette (Ctrl/Cmd+K). One surface reaches
 * every document (by title, metadata or body content — content hits
 * jump the editor to the matched line) plus the app's common actions,
 * from any screen. Mounted once in App; header buttons open it via a
 * window event so no prop drilling is needed.
 */

export function openPalette(): void {
  window.dispatchEvent(new Event("ps:palette"));
}

interface Item {
  key: string;
  icon: IconName;
  title: string;
  detail?: string;
  section: "Documents" | "Actions";
  run: () => void;
}

export function CommandPalette() {
  const { docs, settings } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // CodeMirror claims Mod-K for "insert link" and preventDefaults it.
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setOpen((v) => !v);
      }
    };
    const onOpen = () => {
      setQuery("");
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("ps:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ps:palette", onOpen);
    };
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const isDark = settings.theme === "dark" || (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);

  const actions: Item[] = useMemo(
    () => [
      ...TEMPLATE_META_LIST.map((tm) => ({
        key: `new-${tm.id}`,
        icon: "plus" as IconName,
        title: `New ${tm.name}`,
        detail: tm.description,
        section: "Actions" as const,
        run: () => {
          const d = createDoc({ template: tm.id, title: tm.starterTitle, body: tm.starter });
          navigate({ edit: d.id });
        },
      })),
      {
        key: "import",
        icon: "upload",
        title: "Import files…",
        detail: "Markdown, text, HTML or a Polity backup",
        section: "Actions",
        run: () => pickAndImportFiles(toast, (d) => navigate({ edit: d.id })),
      },
      { key: "library", icon: "back", title: "Go to Library", section: "Actions", run: () => navigate("library") },
      { key: "settings", icon: "settings", title: "Open Settings", section: "Actions", run: () => navigate("settings") },
      { key: "help", icon: "help", title: "Markdown guide & help", section: "Actions", run: () => navigate("help") },
      {
        key: "theme",
        icon: isDark ? "sun" : "moon",
        title: isDark ? "Switch to light theme" : "Switch to dark theme",
        section: "Actions",
        run: () => saveSettings({ theme: isDark ? "light" : "dark" }),
      },
      {
        key: "backup",
        icon: "download",
        title: "Download backup (.json)",
        detail: "All documents, settings & branding",
        section: "Actions",
        run: () => downloadFile("polity-studio-backup.json", exportBackup(), "application/json"),
      },
    ],
    [isDark, toast],
  );

  function docItem(doc: Doc, hit?: SearchHit): Item {
    return {
      key: `doc-${doc.id}`,
      icon: "file",
      title: doc.title || "Untitled",
      detail: hit?.snippet || `${TEMPLATE_META[doc.template].name} · ${relativeDate(doc.updatedAt)}`,
      section: "Documents",
      run: () => navigate(hit?.line && hit.line > 1 ? { edit: doc.id, line: hit.line } : { edit: doc.id }),
    };
  }

  const q = query.trim();
  const items: Item[] = useMemo(() => {
    if (!q) return [...docs.slice(0, 6).map((d) => docItem(d)), ...actions];
    const tokens = q.toLowerCase().split(/\s+/);
    const acts = actions.filter((a) => tokens.every((t) => a.title.toLowerCase().includes(t)));
    return [...searchDocs(docs, q, 12).map((h) => docItem(h.doc, h)), ...acts];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, docs, actions]);

  useEffect(() => setActive(0), [q, open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[active];
      if (it) {
        close();
        it.run();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  if (!open) return null;

  let lastSection = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Search & commands">
      <div className="absolute inset-0 bg-black/55" onClick={close} />
      <div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-edge px-4">
          <Icon name="search" size={16} className="flex-none text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search documents & content, or run a command…"
            aria-label="Search documents and commands"
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-faint"
          />
          <kbd className="hidden flex-none rounded border border-edge px-1.5 py-0.5 text-[10px] text-faint sm:block">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-faint">Nothing matches “{q}”.</p>
          ) : (
            items.map((it, i) => {
              const header = it.section !== lastSection ? (lastSection = it.section) : null;
              return (
                <Fragment key={it.key}>
                  {header && <p className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-faint">{header}</p>}
                  <button
                    data-idx={i}
                    onClick={() => {
                      close();
                      it.run();
                    }}
                    onMouseMove={() => setActive(i)}
                    className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === active && "bg-raised")}
                  >
                    <Icon name={it.icon} size={15} className={cx("flex-none", i === active ? "text-accent" : "text-faint")} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{it.title}</span>
                      {it.detail && <span className="block truncate text-xs text-faint">{it.detail}</span>}
                    </span>
                  </button>
                </Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
