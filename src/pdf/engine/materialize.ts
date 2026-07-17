/**
 * Pseudo-element materialization.
 *
 * ::before/::after boxes are invisible to DOM traversal, so before
 * transcription every generated box is replaced with a real <x-pseudo>
 * element carrying the pseudo's full computed style inline, occupying
 * exactly the same box. Generated text (counters, page numbers) is
 * resolved from the data-counter-* attributes Paged.js stamps during
 * layout plus the page context.
 */

const STYLE_ID = "x-pseudo-off";

function resolveCounter(el: Element, name: string, pageNum: number, pageTotal: number): number {
  if (name === "page") return pageNum;
  if (name === "pages") return pageTotal;
  // (TOC page references are no longer counters — the harness fills real
  // .toc__page spans after layout, so they transcribe as ordinary text.)
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

/** Materializes all pseudo-elements inside the paginated document. */
export function materializePseudos(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return; // already done
  const win = doc.defaultView!;
  const pages = [...doc.querySelectorAll<HTMLElement>(".pagedjs_page")];
  const total = pages.length;

  interface Job {
    el: Element;
    which: "::before" | "::after";
    css: string;
    text: string;
  }
  const jobs: Job[] = [];

  for (const page of pages) {
    const pageNum = parseInt(page.dataset.pageNumber || "0", 10);
    for (const el of [page, ...page.querySelectorAll("*")]) {
      if (el.tagName === "X-PSEUDO") continue;
      for (const which of ["::before", "::after"] as const) {
        const ps = win.getComputedStyle(el, which);
        const content = ps.content;
        if (!content || content === "none" || content === "normal") continue;
        // Snapshot every longhand now — disabling the pseudo later
        // invalidates this declaration object.
        let css = "";
        for (let i = 0; i < ps.length; i++) {
          const prop = ps.item(i);
          if (prop === "content" || prop.startsWith("--")) continue;
          css += `${prop}:${ps.getPropertyValue(prop)};`;
        }
        jobs.push({ el, which, css, text: resolveContent(content, el, pageNum, total) });
      }
    }
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
