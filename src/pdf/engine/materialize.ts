/**
 * Pseudo-element materialization.
 *
 * ::before/::after boxes are invisible to DOM traversal, so before
 * transcription every generated box is replaced with a real <x-pseudo>
 * element carrying the pseudo's full computed style inline, occupying
 * exactly the same box. Generated text (counters, page numbers,
 * target-counter page references) is resolved from the data-counter-*
 * attributes Paged.js stamps during layout plus the page context.
 */

const STYLE_ID = "x-pseudo-off";

function resolveCounter(el: Element, name: string, pageNum: number, pageTotal: number): number {
  if (name === "page") return pageNum;
  if (name === "pages") return pageTotal;
  if (name.startsWith("target-counter")) {
    // Paged.js names TOC page-reference counters this way; the page
    // number is where the link target landed.
    const href = (el.closest("a[href^='#']") as HTMLAnchorElement | null)?.getAttribute("href");
    if (href) {
      try {
        const target = el.ownerDocument.getElementById(decodeURIComponent(href.slice(1)));
        const page = target?.closest(".pagedjs_page") as HTMLElement | null;
        if (page?.dataset.pageNumber) return parseInt(page.dataset.pageNumber, 10);
      } catch {
        /* malformed href */
      }
    }
    return 0;
  }
  for (let node: Element | null = el; node; node = node.parentElement) {
    const v = node.getAttribute(`data-counter-${name}-value`);
    if (v !== null) return parseInt(v, 10) || 0;
  }
  return 0;
}

function formatCounter(value: number, style: string): string {
  if (style === "decimal-leading-zero") return String(value).padStart(2, "0");
  return String(value);
}

/** Resolves a computed `content` value into plain text. */
export function resolveContent(content: string, el: Element, pageNum: number, pageTotal: number): string {
  let out = "";
  const re = /"((?:[^"\\]|\\.)*)"|counter\(\s*([\w-]+)\s*(?:,\s*([\w-]+)\s*)?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m[1] !== undefined) {
      out += m[1].replace(/\\([\s\S])/g, "$1").replace(/\\A\s?/g, "\n");
    } else {
      out += formatCounter(resolveCounter(el, m[2], pageNum, pageTotal), m[3] || "decimal");
    }
  }
  return out;
}

/** Splits a selector list on top-level commas only — a naive split would
    break selectors like `:is(h2, h3)::before`. */
function splitSelectorList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Every base selector the document's stylesheets attach a ::before /
    ::after to. Pseudo-element boxes can only come from CSS rules (inline
    style can't create one), and every stylesheet in the export iframe is
    first-party and same-origin — so this enumeration is complete ground
    truth, and lets the materializer probe only elements that *can* have a
    generated box instead of calling getComputedStyle twice on every
    element of every page (a synchronous full-DOM scan that froze the tab
    for the whole scan on 100+ page documents — the same scaling bug the
    HTML export's counter baker had, see htmlExport.ts). Returns null when
    anything about the stylesheet walk fails (a cross-origin sheet, an
    unparsable selector) so the caller can fall back to the exhaustive
    scan — correctness first, the fast path is only an optimization. */
function pseudoSelectors(doc: Document): { before: string; after: string } | null {
  try {
    const bases = { before: new Set<string>(), after: new Set<string>() };
    const visit = (rules: CSSRuleList): void => {
      for (const rule of rules) {
        // Duck-typed (not instanceof) — these objects belong to the
        // iframe's realm, whose CSSStyleRule is a different constructor.
        const selector = (rule as CSSStyleRule).selectorText;
        if (typeof selector === "string" && /::?(before|after)\b/.test(selector)) {
          for (const part of splitSelectorList(selector)) {
            const m = part.match(/^(.*?)::?(before|after)\b/);
            if (!m) continue;
            const base = m[1].trim() || "*";
            bases[m[2] as "before" | "after"].add(base);
          }
        }
        const nested = (rule as CSSGroupingRule).cssRules;
        if (nested) visit(nested);
      }
    };
    for (const sheet of doc.styleSheets) visit(sheet.cssRules);
    if (!bases.before.size && !bases.after.size) return null;
    // Validate now — an unsupported selector must throw here (→ full
    // scan), not midway through the per-page loop.
    const before = [...bases.before].join(", ");
    const after = [...bases.after].join(", ");
    if (before) doc.querySelector(before);
    if (after) doc.querySelector(after);
    return { before, after };
  } catch {
    return null;
  }
}

function candidatesIn(page: HTMLElement, selector: string): Element[] {
  if (!selector) return [];
  const list: Element[] = page.matches(selector) ? [page] : [];
  list.push(...page.querySelectorAll(selector));
  return list;
}

/** Materializes all pseudo-elements inside the paginated document.
    Async: yields to the event loop between pages so the export UI keeps
    painting while large documents are scanned. */
export async function materializePseudos(doc: Document): Promise<void> {
  if (doc.getElementById(STYLE_ID)) return; // already done
  const win = doc.defaultView!;
  const pages = [...doc.querySelectorAll<HTMLElement>(".pagedjs_page")];
  const total = pages.length;
  const scoped = pseudoSelectors(doc);

  interface Job {
    el: Element;
    which: "::before" | "::after";
    css: string;
    text: string;
  }
  const jobs: Job[] = [];

  const snapshot = (el: Element, which: "::before" | "::after", pageNum: number): void => {
    if (el.tagName === "X-PSEUDO") return;
    const ps = win.getComputedStyle(el, which);
    const content = ps.content;
    if (!content || content === "none" || content === "normal") return;
    // Snapshot every longhand now — disabling the pseudo later
    // invalidates this declaration object.
    let css = "";
    for (let i = 0; i < ps.length; i++) {
      const prop = ps.item(i);
      if (prop === "content" || prop.startsWith("--")) continue;
      css += `${prop}:${ps.getPropertyValue(prop)};`;
    }
    jobs.push({ el, which, css, text: resolveContent(content, el, pageNum, total) });
  };

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    const pageNum = parseInt(page.dataset.pageNumber || "0", 10);
    if (scoped) {
      for (const el of candidatesIn(page, scoped.before)) snapshot(el, "::before", pageNum);
      for (const el of candidatesIn(page, scoped.after)) snapshot(el, "::after", pageNum);
    } else {
      for (const el of [page, ...page.querySelectorAll("*")]) {
        snapshot(el, "::before", pageNum);
        snapshot(el, "::after", pageNum);
      }
    }
    // Yield every few pages so a long scan never freezes the tab.
    if (p % 8 === 7) await new Promise((r) => setTimeout(r, 0));
  }

  // Disable all pseudos first, then insert the replacements, so the
  // document never briefly contains both boxes.
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = ".x-po::before,.x-po::after{content:none!important;display:none!important}";
  doc.head.appendChild(style);
  for (const j of jobs) j.el.classList.add("x-po");
  for (const j of jobs) {
    const span = doc.createElement("x-pseudo");
    span.style.cssText = j.css;
    if (j.text) span.textContent = j.text;
    if (j.which === "::before") j.el.insertBefore(span, j.el.firstChild);
    else j.el.appendChild(span);
  }
}
