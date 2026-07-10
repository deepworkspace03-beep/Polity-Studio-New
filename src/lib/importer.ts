import { importBackup } from "./store";
import { newTally, plural, summarize, wrap, type Tally } from "./importTally";
import { docxToMarkdown, isDocxSupported } from "./docx";
import type { TemplateId } from "./types";

/**
 * Smart import engine — converts whatever arrives via clipboard, drag &
 * drop or the file picker (Word / Google Docs HTML, web pages, AI-chat
 * output, plain or Markdown text) into the app's Markdown dialect.
 *
 * Zero dependencies by design: the browser's DOMParser is the HTML
 * parser, and one recursive walk serializes to Markdown. Conversions
 * are conservative — when nothing would be gained over a plain paste,
 * smartPaste returns null and the default browser paste happens.
 */

export interface ImportResult {
  markdown: string;
  /** One-line human summary for the toast ("Converted Word content…"). */
  summary: string;
}

/* ── Conversion tally → human summary ─────────────────────────────── */

function flavorOf(html: string): string {
  if (/mso-|urn:schemas-microsoft-com|class="?Mso/i.test(html)) return "Word content";
  if (/docs-internal-guid/.test(html)) return "Google Docs content";
  return "rich text";
}

/* ── HTML → Markdown ──────────────────────────────────────────────── */

const SKIP_TAGS = new Set([
  "script", "style", "noscript", "template", "iframe", "object", "embed",
  "svg", "button", "input", "select", "textarea", "nav", "form", "o:p", "head", "title", "meta", "link",
]);

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table",
  "blockquote", "pre", "hr", "section", "article", "main", "header", "footer",
  "figure", "figcaption", "dl", "dt", "dd", "aside", "center", "details", "summary", "address",
]);

const styleAttr = (el: Element): string => (el.getAttribute("style") || "").toLowerCase();

/** Strips zero-width junk, turns NBSP into space, collapses runs of
    whitespace (HTML semantics). ZWJ/ZWNJ are kept — they are meaningful
    in Devanagari text. */
function cleanText(s: string): string {
  return s.replace(/[\u200b\ufeff]/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}

function inlineChildren(el: Element, t: Tally): string {
  let out = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += cleanText(node.nodeValue || "");
    else if (node.nodeType === Node.ELEMENT_NODE) out += inlineNode(node as Element, t);
  }
  return out;
}

function inlineNode(el: Element, t: Tally): string {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return "";
  const style = styleAttr(el);
  if (style.includes("mso-list:ignore")) return ""; // Word's literal bullet/number glyphs
  if (tag === "br") return "\\\n"; // CommonMark hard break — visible, survives whitespace trims
  if (tag === "img") {
    const src = el.getAttribute("src") || "";
    if (/^https?:\/\//i.test(src)) return `![${el.getAttribute("alt") || ""}](${src})`;
    t.imagesDropped++; // data: / file: images would bloat the doc and can't publish reliably
    return "";
  }
  const inner = inlineChildren(el, t);
  if (!inner.trim()) return inner;
  switch (tag) {
    case "code": case "kbd": case "samp":
      return "`" + inner.trim().replace(/`/g, "'") + "`";
    case "a": {
      const href = el.getAttribute("href") || "";
      if (!/^https?:\/\//i.test(href)) return inner;
      t.links++;
      return `[${inner.trim()}](${href})`;
    }
    case "sub": return wrap(inner, "~");
    case "sup": return wrap(inner, "^");
    case "mark": return wrap(inner, "==");
    case "s": case "del": case "strike": return wrap(inner, "~~");
  }
  // Formatting arrives as semantic tags or styled spans (Google Docs
  // emits <span style="font-weight:700">) — treat both alike. Google
  // Docs also wraps the whole clipboard in <b style="font-weight:normal">,
  // which must NOT read as bold.
  let out = inner;
  const weight = style.match(/font-weight\s*:\s*(\d+|bold|normal)/)?.[1];
  const bold = tag === "b" || tag === "strong"
    ? weight !== "normal" && weight !== "400"
    : weight === "bold" || Number(weight) >= 600;
  const italic = tag === "em" || tag === "i" ? !style.includes("font-style:normal") : /font-style\s*:\s*italic/.test(style);
  const underline = tag === "u" || tag === "ins" || /text-decoration[^;]*underline/.test(style);
  const highlight = (tag === "span" || tag === "font") &&
    /background(?:-color)?\s*:\s*(?!transparent|inherit|initial|none|white|#fff\b|#ffffff|rgb\(255,\s*255,\s*255\))\S/.test(style);
  if (italic) out = wrap(out, "*");
  if (bold) out = wrap(out, "**");
  if (underline) out = wrap(out, "++");
  if (highlight) out = wrap(out, "==");
  return out;
}

function listToMd(list: Element, t: Tally, indent: string, ordered: boolean): string {
  const lines: string[] = [];
  let n = 1;
  for (const li of list.children) {
    if (li.tagName.toLowerCase() !== "li") continue;
    t.listItems++;
    const marker = ordered ? `${n++}. ` : "- ";
    let text = "";
    const nested: string[] = [];
    for (const node of li.childNodes) {
      const tag = node.nodeType === Node.ELEMENT_NODE ? (node as Element).tagName.toLowerCase() : "";
      if (tag === "ul" || tag === "ol") {
        nested.push(listToMd(node as Element, t, indent + " ".repeat(marker.length), tag === "ol"));
      } else if (node.nodeType === Node.TEXT_NODE) {
        text += cleanText(node.nodeValue || "");
      } else if (tag === "p" || tag === "div") {
        const s = inlineChildren(node as Element, t).trim();
        if (s) text += (text.trim() ? "\\\n" + indent + " ".repeat(marker.length) : "") + s;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        text += inlineNode(node as Element, t);
      }
    }
    lines.push(indent + marker + text.trim());
    for (const block of nested) if (block) lines.push(block);
  }
  return lines.join("\n");
}

function tableToMd(tableEl: Element, t: Tally): string {
  const rows = [...tableEl.querySelectorAll("tr")].map((tr) =>
    [...tr.children]
      .filter((c) => /^t[hd]$/i.test(c.tagName))
      .map((c) => inlineChildren(c, t).trim().replace(/\|/g, "\\|").replace(/\s*\\\n\s*/g, " ")),
  );
  if (!rows.length) return "";
  t.tables++;
  const width = Math.max(...rows.map((r) => r.length), 1);
  const line = (r: string[]) => "| " + Array.from({ length: width }, (_, i) => r[i] || "").join(" | ") + " |";
  return [line(rows[0]), "| " + Array(width).fill("---").join(" | ") + " |", ...rows.slice(1).map(line)].join("\n");
}

function blockNode(el: Element, tag: string, t: Tally): string[] {
  const hm = tag.match(/^h([1-6])$/);
  if (hm) {
    const text = inlineChildren(el, t).trim();
    if (!text) return [];
    t.headings++;
    return ["#".repeat(Number(hm[1])) + " " + text];
  }
  switch (tag) {
    case "p": {
      // Word encodes list items as <p style="mso-list:…"> with the glyph
      // in an Ignore-span (stripped above) — re-materialize the bullet.
      if (styleAttr(el).includes("mso-list")) {
        const s = inlineChildren(el, t).trim();
        if (!s) return [];
        t.listItems++;
        return ["- " + s];
      }
      const s = inlineChildren(el, t).trim();
      return s ? [s] : [];
    }
    case "ul": case "ol":
      return [listToMd(el, t, "", tag === "ol")];
    case "blockquote": {
      const inner = renderBlocks(el, t).join("\n\n");
      if (!inner) return [];
      t.quotes++;
      return [inner.split("\n").map((l) => "> " + l).join("\n")];
    }
    case "pre": {
      const code = (el.textContent || "").replace(/\n$/, "");
      if (!code.trim()) return [];
      t.codeBlocks++;
      const lang = (el.className + " " + (el.querySelector("code")?.className || "")).match(/language-(\w+)/)?.[1] || "";
      return ["```" + lang + "\n" + code + "\n```"];
    }
    case "hr":
      return ["---"];
    case "table":
      return [tableToMd(el, t)];
    default:
      // div/section/figure/… are transparent containers
      return renderBlocks(el, t);
  }
}

function renderBlocks(el: Element, t: Tally): string[] {
  const blocks: string[] = [];
  let buf = "";
  const flush = () => {
    const s = buf.replace(/\s*\\\n\s*/g, "\\\n").trim();
    if (s) blocks.push(s);
    buf = "";
  };
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      buf += cleanText(node.nodeValue || "");
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const child = node as Element;
    const tag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    if (!BLOCK_TAGS.has(tag)) {
      // An inline tag holding block children is a container, not
      // formatting — Google Docs wraps its whole clipboard in
      // <b style="font-weight:normal">…</b>.
      if (child.querySelector("p,div,ul,ol,li,table,blockquote,pre,h1,h2,h3,h4,h5,h6,hr")) {
        flush();
        for (const block of renderBlocks(child, t)) blocks.push(block);
      } else {
        buf += inlineNode(child, t);
      }
      continue;
    }
    flush();
    for (const block of blockNode(child, tag, t)) if (block) blocks.push(block);
  }
  flush();
  return blocks;
}

export function htmlToMarkdown(html: string): ImportResult {
  const t = newTally();
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const markdown = renderBlocks(body, t)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
  return { markdown, summary: summarize(flavorOf(html), t) };
}

/* ── Plain-text tidy ──────────────────────────────────────────────── */

/** Deliberately minimal: only unambiguous fixes, so pasted Markdown
    and MCQ bodies (`Q1.`, `a)` options) pass through untouched. */
export function cleanPlainText(text: string): { markdown: string; fixes: number } {
  let out = text.replace(/\r\n?/g, "\n");
  let fixes = 0;
  const apply = (re: RegExp, sub: string) => {
    const n = (out.match(re) || []).length;
    if (n) {
      fixes += n;
      out = out.replace(re, sub);
    }
  };
  apply(/[\u200b\ufeff]/g, "");
  apply(/ /g, " ");
  apply(/^(\s*)[•·▪●○◦‣]\s+/gm, "$1- "); // unicode bullets → Markdown list markers
  apply(/\n{3,}/g, "\n\n");
  return { markdown: out, fixes };
}

/* ── Smart paste decision ─────────────────────────────────────────── */

/** Only these tags justify the HTML path — VS Code & terminal copies
    are div/span soup that must stay plain text. */
const RICH_RE = /<(h[1-6]|p|ul|ol|li|table|blockquote|pre|img|a|b|strong|em|i|u|s|del|ins|mark|sub|sup|code|hr)[\s>/]/i;

export function smartPaste(html: string, text: string): ImportResult | null {
  if (html && RICH_RE.test(html)) {
    const result = htmlToMarkdown(html);
    // Intercept only when conversion adds structure over what a plain
    // paste would insert anyway.
    if (result.markdown && result.markdown !== text.trim()) return result;
  }
  if (!text) return null;
  const { markdown, fixes } = cleanPlainText(text);
  if (fixes && markdown !== text) {
    return { markdown, summary: `Tidied pasted text — ${plural(fixes, "fix")}` };
  }
  return null;
}

/* ── File import ──────────────────────────────────────────────────── */

export const IMPORT_ACCEPT = ".md,.markdown,.txt,.text,.html,.htm,.json,.docx";

export type FileImport =
  | { kind: "doc"; title: string; body: string; summary: string }
  | { kind: "backup"; json: string }
  | { kind: "skip"; reason: string };

export async function readImportFile(file: File): Promise<FileImport> {
  const ext = file.name.toLowerCase().match(/\.(\w+)$/)?.[1] || "";
  if (ext === "docx") {
    if (!isDocxSupported()) return { kind: "skip", reason: "Word import needs a newer browser" };
    if (file.size > 20_000_000) return { kind: "skip", reason: "file is too large" };
    try {
      const { markdown, summary } = await docxToMarkdown(await file.arrayBuffer());
      return { kind: "doc", title: file.name.replace(/\.\w+$/, ""), body: markdown, summary };
    } catch (err) {
      return { kind: "skip", reason: err instanceof Error ? err.message : "couldn't read this Word file" };
    }
  }
  const textual = ["md", "markdown", "txt", "text", "html", "htm", "json"].includes(ext) || file.type.startsWith("text/");
  if (!textual) return { kind: "skip", reason: "unsupported file type" };
  if (file.size > 5_000_000) return { kind: "skip", reason: "file is too large" };
  const raw = await file.text();
  if (ext === "json") {
    try {
      if ((JSON.parse(raw) as { app?: string })?.app === "polity-studio") return { kind: "backup", json: raw };
    } catch { /* not JSON — fall through to skip */ }
    return { kind: "skip", reason: "not a Polity Studio backup" };
  }
  if (ext === "html" || ext === "htm") {
    const { markdown, summary } = htmlToMarkdown(raw);
    return { kind: "doc", title: file.name.replace(/\.\w+$/, ""), body: markdown, summary };
  }
  return {
    kind: "doc",
    title: file.name.replace(/\.\w+$/, ""),
    body: cleanPlainText(raw).markdown.trim(),
    summary: "imported as Markdown",
  };
}

type Toast = (message: string, tone?: "ok" | "error" | "info") => void;

/** Q1./Q2. style numbered questions are the one format specific enough
    to guess safely — question papers, PYQs and quiz exports converted
    from Word/PDF almost always keep that numbering. Everything else
    (notes vs. revision vs. flashcards) is a stylistic choice the author
    makes in the Import Review picker, not something worth guessing. */
function guessTemplate(body: string): TemplateId {
  const hits = body.match(/^\s{0,3}Q\s*\d*[.):]\s+\S/gim)?.length ?? 0;
  return hits >= 2 ? "mcq" : "notes";
}

export interface StagedDoc {
  title: string;
  body: string;
  summary: string;
  template: TemplateId;
}

/** Converts files into ready-to-review documents, or restores a dropped
    backup immediately (reviewing a full JSON backup line by line isn't
    practical, and restore already has its own toast). Skips and
    restores are reported as they happen; the returned list is what the
    Import Review modal (components/ImportReview.tsx) shows before any
    document is actually created. Titles are just the filename here —
    callers that create whole documents should run the result through
    `promoteLeadingTitle`; callers that insert into an existing document
    must not, or a converted heading would silently vanish. */
export async function stageImportFiles(files: File[], toast: Toast): Promise<StagedDoc[]> {
  const staged: StagedDoc[] = [];
  let restored = 0;
  for (const file of files) {
    const r = await readImportFile(file);
    if (r.kind === "skip") {
      toast(`Skipped ${file.name} — ${r.reason}`, "error");
    } else if (r.kind === "backup") {
      try {
        restored += await importBackup(r.json);
      } catch (err) {
        toast(`${file.name}: ${(err as Error).message}`, "error");
      }
    } else {
      staged.push({ title: r.title, body: r.body, summary: r.summary, template: guessTemplate(r.body) });
    }
  }
  if (restored) toast(`Backup restored — ${plural(restored, "document")}`, "ok");
  return staged;
}

/** Promotes a single leading `# Title` line into the document title —
    the cover renders the title already, so leaving it in the body would
    print it twice. Only meaningful when the result becomes a whole new
    document; never apply this before inserting into an existing one. */
export function promoteLeadingTitle(items: StagedDoc[]): StagedDoc[] {
  return items.map((d) => {
    const m = d.body.match(/^#[ \t]+(.+?)\s*(?:\n+|$)/);
    if (!m) return d;
    return { ...d, title: m[1].trim(), body: d.body.slice(m[0].length).trim() };
  });
}
