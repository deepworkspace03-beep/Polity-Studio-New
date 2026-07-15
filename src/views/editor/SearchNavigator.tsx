import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { type DocMatch, type DocSection, searchInDocument } from "../../lib/docSearch";
import { clearSearchMatches, setSearchMatches } from "./searchHighlight";
import { IconButton, inputClass } from "../../components/ui";
import { cx } from "../../lib/utils";

/** How many result rows to render at once. All matches are still counted
    and highlighted in the editor; the list just stays light for huge notes. */
const DISPLAY_CAP = 300;

/**
 * Smart Search Navigator — an in-editor find/replace that doubles as a
 * table of results. It searches only the currently open document, groups
 * every hit under its nearest heading with an estimated page number, and
 * jumps the editor straight to a clicked result (highlighting it in place)
 * without stealing focus from the search box. Matching lives in
 * lib/docSearch.ts; highlighting in ./searchHighlight.ts.
 */
export function SearchNavigator({
  body,
  estPages,
  getView,
  onClose,
}: {
  body: string;
  estPages: number;
  getView: () => EditorView | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  // Defer against the live body so typing in the editor never blocks; the
  // query itself stays instant.
  const deferredBody = useDeferredValue(body);
  const result = useMemo(
    () => searchInDocument(deferredBody, query, { caseSensitive, wholeWord, estPages }),
    [deferredBody, query, caseSensitive, wholeWord, estPages],
  );
  const matches = result.matches;
  const activeIdx = matches.length ? Math.min(active, matches.length - 1) : 0;

  // A new query starts from the top.
  useEffect(() => setActive(0), [query, caseSensitive, wholeWord]);

  // Focus the field when the panel opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Paint the editor: every match softly, the active one strongly.
  useEffect(() => {
    const view = getView();
    if (!view) return;
    if (!matches.length) view.dispatch({ effects: clearSearchMatches.of(null) });
    else view.dispatch({ effects: setSearchMatches.of({ ranges: matches, active: activeIdx }) });
  }, [matches, activeIdx, getView]);

  // Clear highlights when the navigator unmounts (closed).
  useEffect(() => {
    return () => {
      getView()?.dispatch({ effects: clearSearchMatches.of(null) });
    };
  }, [getView]);

  // Keep the active row visible in the results list as you step through.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function reveal(idx: number) {
    if (!matches.length) return;
    const i = ((idx % matches.length) + matches.length) % matches.length;
    setActive(i);
    const view = getView();
    const m = matches[i];
    // Move the selection to the match and scroll it into view, but return
    // DOM focus to the search box (a clicked result row would otherwise keep
    // it) so the author can keep stepping through hits — the editor is never
    // handed focus, so their place in it is never disturbed.
    view?.dispatch({ selection: { anchor: m.from, head: m.to }, scrollIntoView: true });
    inputRef.current?.focus();
  }

  function replaceCurrent() {
    const view = getView();
    if (!view || !matches.length) return;
    const m = matches[activeIdx];
    view.dispatch({ changes: { from: m.from, to: m.to, insert: replaceWith } });
    // Body updates via the editor's onChange → results recompute; the
    // clamped index lands on the following occurrence.
  }

  function replaceAll() {
    const view = getView();
    if (!view || !matches.length) return;
    view.dispatch({ changes: matches.map((m) => ({ from: m.from, to: m.to, insert: replaceWith })) });
  }

  // Build contiguous section groups from the ordered match list.
  const groups = useMemo(() => {
    const out: { section: DocSection; matches: { m: DocMatch; index: number }[] }[] = [];
    let cur = -1;
    for (let i = 0; i < matches.length && i < DISPLAY_CAP; i++) {
      const m = matches[i];
      if (m.section !== cur) {
        cur = m.section;
        out.push({ section: result.sections[m.section], matches: [] });
      }
      out[out.length - 1].matches.push({ m, index: i });
    }
    return out;
  }, [matches, result.sections]);

  const shownCount = Math.min(matches.length, DISPLAY_CAP);

  return (
    <div
      className="flex flex-col border-b border-edge bg-surface"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5">
        <div className="relative flex min-w-0 flex-1 items-center">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                reveal(activeIdx + (e.shiftKey ? -1 : 1));
              }
            }}
            placeholder="Find in this document…"
            aria-label="Find in this document"
            className={inputClass + " h-8 py-1 pr-16 text-sm"}
          />
          <span className="pointer-events-none absolute right-2 text-[11px] tabular-nums text-faint">
            {query ? `${matches.length ? activeIdx + 1 : 0}/${result.total}${result.capped ? "+" : ""}` : ""}
          </span>
        </div>
        <button
          type="button"
          aria-pressed={caseSensitive}
          title="Match case"
          onClick={() => setCaseSensitive((v) => !v)}
          className={cx(
            "h-8 rounded-lg border px-2 text-xs font-semibold transition-colors",
            caseSensitive ? "border-accent bg-accent/15 text-accent" : "border-edge text-ink-2 hover:bg-raised",
          )}
        >
          Aa
        </button>
        <button
          type="button"
          aria-pressed={wholeWord}
          title="Whole word"
          onClick={() => setWholeWord((v) => !v)}
          className={cx(
            "h-8 rounded-lg border px-2 text-xs font-semibold transition-colors",
            wholeWord ? "border-accent bg-accent/15 text-accent" : "border-edge text-ink-2 hover:bg-raised",
          )}
        >
          W
        </button>
        <IconButton label="Previous match" name="chevronLeft" size={15} onClick={() => reveal(activeIdx - 1)} />
        <IconButton label="Next match" name="chevronRight" size={15} onClick={() => reveal(activeIdx + 1)} />
        <IconButton
          label={showReplace ? "Hide replace" : "Replace…"}
          name="replace"
          size={15}
          active={showReplace}
          onClick={() => setShowReplace((v) => !v)}
        />
        <IconButton label="Close search" name="x" size={15} onClick={onClose} />
      </div>

      {showReplace && (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-1.5">
          <input
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                replaceCurrent();
              }
            }}
            placeholder="Replace with…"
            aria-label="Replace with"
            className={inputClass + " h-8 min-w-0 flex-1 py-1 text-sm"}
          />
          <button
            type="button"
            onClick={replaceCurrent}
            disabled={!matches.length}
            className="h-8 rounded-lg border border-edge px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-raised disabled:opacity-40"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={replaceAll}
            disabled={!matches.length}
            className="h-8 rounded-lg border border-edge px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-raised disabled:opacity-40"
          >
            All
          </button>
        </div>
      )}

      {query && (
        <div className="max-h-[40vh] min-h-0 overflow-y-auto border-t border-edge">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-faint">No matches in this document.</p>
          ) : (
            <>
              {groups.map((g, gi) => (
                <div key={gi}>
                  <div className="sticky top-0 flex items-center gap-2 bg-raised/95 px-3 py-1 backdrop-blur">
                    <span className="truncate text-[11px] font-semibold text-ink-2">
                      {g.section.level === 0 ? "Top of document" : g.section.title}
                    </span>
                    <span className="ml-auto flex-none text-[10px] tabular-nums text-faint">≈ p.{g.section.page}</span>
                  </div>
                  {g.matches.map(({ m, index }) => (
                    <button
                      key={index}
                      ref={index === activeIdx ? activeRowRef : undefined}
                      type="button"
                      onClick={() => reveal(index)}
                      className={cx(
                        "flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                        index === activeIdx ? "bg-accent/15" : "hover:bg-raised",
                      )}
                    >
                      <span className="flex-none tabular-nums text-faint">{m.line}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-2">
                        {m.before}
                        <mark className="rounded bg-accent/30 px-0.5 text-ink">{m.hit}</mark>
                        {m.after}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {matches.length > shownCount && (
                <p className="px-3 py-2 text-[11px] text-faint">
                  Showing the first {shownCount} of {result.total}
                  {result.capped ? "+" : ""} matches — refine your search to narrow it down.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
