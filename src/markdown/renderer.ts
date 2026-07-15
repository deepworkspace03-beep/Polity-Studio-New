import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import container from "markdown-it-container";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import ins from "markdown-it-ins";
import { figureClass, parseFigureAttrs } from "./figure";

/* ── Slugs ─────────────────────────────────────────────────────────── */

export function slugify(text: string): string {
  const slug =
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "section";
  // Ids must be valid CSS identifiers: a heading like "1.1 Doctrine"
  // would otherwise produce "#11-doctrine", which querySelector rejects —
  // Paged.js resolves TOC page references with exactly that call, so a
  // single numbered heading would abort pagination of the whole document.
  return /^[a-z_\p{L}]/u.test(slug) ? slug : `s-${slug}`;
}

/* ── Callout boxes ─────────────────────────────────────────────────
   Authors write:
       ::: definition Sovereignty
       The supreme authority within a territory.
       :::
   Each type carries an icon + label and its own print style. */

interface CalloutDef {
  label: string;
  /** What the callout is for — shown in the toolbar menu. */
  hint: string;
  icon: string;
}

const stroke = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const CALLOUTS: Record<string, CalloutDef> = {
  definition: {
    label: "Definition",
    hint: "A term and its precise meaning",
    icon: stroke('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  },
  important: {
    label: "Important",
    hint: "Must-know point, highly examinable",
    icon: stroke('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  },
  exam: {
    label: "Exam Angle",
    hint: "How examiners ask about this topic",
    icon: stroke('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  },
  tip: {
    label: "Tip",
    hint: "Memory aid or study shortcut",
    icon: stroke('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/>'),
  },
  example: {
    label: "Example",
    hint: "Concrete case or illustration",
    icon: stroke('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
  },
  summary: {
    label: "Summary",
    hint: "Section recap in a few lines",
    icon: stroke('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  },
  note: {
    label: "Note",
    hint: "Side remark or context",
    icon: stroke('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
  },
  warning: {
    label: "Warning",
    hint: "Common mistake or trap to avoid",
    icon: stroke('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  },
};

/* ── Renderer ──────────────────────────────────────────────────────── */

let md: MarkdownIt | null = null;

function getRenderer(): MarkdownIt {
  if (md) return md;

  md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    quotes: "“”‘’",
  });

  md.use(anchor, { slugify, tabIndex: false });
  md.use(footnote);
  md.use(taskLists, { label: true });
  md.use(mark); // ==highlight==
  md.use(sub); // H~2~O
  md.use(sup); // x^2^
  md.use(ins); // ++underline++

  for (const [type, def] of Object.entries(CALLOUTS)) {
    md.use(container, type, {
      render(tokens: { nesting: number; info: string; attrGet(name: string): string | null }[], idx: number) {
        const tok = tokens[idx];
        if (tok.nesting === 1) {
          const custom = tok.info.trim().slice(type.length).trim();
          const line = tok.attrGet?.("data-line");
          return (
            `<aside class="callout callout--${type}"${line ? ` data-line="${line}"` : ""}>` +
            `<div class="callout__head"><span class="callout__icon">${def.icon}</span>` +
            `<span class="callout__label">${md!.utils.escapeHtml(custom || def.label)}</span></div>` +
            `<div class="callout__body">`
          );
        }
        return `</div></aside>\n`;
      },
    });
  }

  // List markers as real elements (not ::marker pseudo-boxes) so the
  // PDF engine can transcribe them and their styling is consistent
  // across preview and export. Task-list items keep their checkboxes.
  md.core.ruler.push("studio_list_marks", (state) => {
    const stack: { ordered: boolean; index: number }[] = [];
    for (const token of state.tokens) {
      if (token.type === "bullet_list_open") stack.push({ ordered: false, index: 0 });
      else if (token.type === "ordered_list_open") {
        stack.push({ ordered: true, index: Number(token.attrGet("start") ?? 1) });
      } else if (token.type === "bullet_list_close" || token.type === "ordered_list_close") stack.pop();
      else if (token.type === "list_item_open" && stack.length) {
        const list = stack[stack.length - 1];
        token.meta = { ...token.meta, mark: list.ordered ? `${list.index++}.` : "•" };
      }
    }
  });
  const defaultListItem =
    md.renderer.rules.list_item_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
    const open = defaultListItem(tokens, idx, options, env, self);
    const mark = tokens[idx].meta?.mark;
    if (!mark || (tokens[idx].attrGet("class") || "").includes("task-list-item")) return open;
    return `${open}<span class="li-mark" aria-hidden="true">${mark}</span>`;
  };

  // Standalone images → <figure>. An author-friendly, dependency-free
  // image layer: any source line that is just an image becomes a figure. A
  // caption comes from the Markdown title (`![alt](src "cap")`); size,
  // layout (center · left/right float-wrap · full width) and styling
  // (border, rounded corners, shadow, spacing) from an optional trailing
  // `{width=60% align=left border …}` — parsed by markdown/figure.ts so the
  // in-editor image controls write exactly what the renderer reads. Inline
  // images (inside a sentence) keep the default <img> rendering.
  //
  // The image line may open its paragraph with the wrapped text following
  // on the very next line (no blank line) — the natural way to author a
  // textbook float-wrap, and what the editor's image toolbar recognizes.
  // That leading line splits into a figure and the paragraph continues
  // without it; only a same-line trailing sentence keeps the image inline.
  md.core.ruler.push("studio_figures", (state) => {
    const t = state.tokens;
    for (let i = 0; i < t.length - 2; i++) {
      if (t[i].type !== "paragraph_open" || t[i + 1].type !== "inline" || t[i + 2].type !== "paragraph_close") continue;
      const inline = t[i + 1];
      const kids = (inline.children ?? []).filter((c) => !(c.type === "text" && !c.content.trim()));
      if (kids.length === 0 || kids[0].type !== "image") continue;
      let attrs = "";
      let next = 1;
      if (kids[next]?.type === "text") {
        const m = /^\{([^}]*)\}$/.exec(kids[next].content.trim());
        if (!m) continue; // image plus other same-line text — stays inline
        attrs = m[1];
        next++;
      }
      // Whatever follows the image line must start on its own source line.
      let rest: typeof kids | null = null;
      if (next < kids.length) {
        if (kids[next].type !== "softbreak") continue;
        rest = kids.slice(next + 1);
      }

      const img = kids[0];
      const src = img.attrGet("src") || "";
      const alt = img.content;
      const title = img.attrGet("title") || "";
      const fig = parseFigureAttrs(attrs);
      const map = t[i].map;
      const line = map ? map[0] + 1 : null;
      const esc = md!.utils.escapeHtml;
      const html =
        `<figure class="${figureClass(fig)}"${line ? ` data-line="${line}"` : ""}` +
        `${fig.width ? ` style="--fig-w:${fig.width}"` : ""}>` +
        `<img src="${esc(src)}" alt="${esc(alt)}"${fig.cover ? ' class="md-img--cover"' : ""}>` +
        `${title ? `<figcaption>${esc(title)}</figcaption>` : ""}</figure>\n`;
      const tok = new state.Token("html_block", "", 0);
      tok.content = html;
      if (rest && rest.length) {
        // Figure first, then the paragraph keeps flowing with the image
        // line removed; its source map moves down to the continuation.
        inline.children = rest;
        if (t[i].map) t[i].map = [t[i].map![0] + 1, t[i].map![1]];
        if (inline.map) inline.map = [inline.map[0] + 1, inline.map[1]];
        t.splice(i, 0, tok);
      } else {
        t.splice(i, 3, tok);
      }
    }
  });

  // Typographic arrow shortcuts — a few unambiguous ASCII sequences that
  // read as arrows in study notes (cause→effect, mappings) become real
  // Unicode glyphs. Runs on plain text runs only (never code spans, code
  // blocks, links or attributes), so pasted Markdown and code stay intact.
  // Longest sequences are ordered first so "<->" wins over "->".
  const ARROWS: Record<string, string> = {
    "<-->": "↔", "<->": "↔", "<--": "←", "<-": "←", "-->": "→", "->": "→", "==>": "⇒", "=>": "⇒",
  };
  const ARROW_RE = /<-->|<->|<--|<-|-->|->|==>|=>/g;
  // Before the typographer's dash rule, so "-->" becomes an arrow rather
  // than an en-dash + ">".
  md.core.ruler.before("replacements", "studio_arrows", (state) => {
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.children) continue;
      for (const child of token.children) {
        if (child.type === "text" && (child.content.includes("-") || child.content.includes("="))) {
          child.content = child.content.replace(ARROW_RE, (m) => ARROWS[m]);
        }
      }
    }
  });

  // `\pagebreak` (or `\newpage`) alone on a line forces a page break.
  md.core.ruler.push("studio_pagebreak", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length - 2; i++) {
      if (
        tokens[i].type === "paragraph_open" &&
        tokens[i + 1].type === "inline" &&
        /^\\(pagebreak|newpage)$/.test(tokens[i + 1].content.trim())
      ) {
        const t = new state.Token("html_block", "", 0);
        const line = tokens[i].map ? tokens[i].map![0] + 1 : null;
        t.content = `<div class="page-break"${line ? ` data-line="${line}"` : ""} aria-hidden="true"></div>\n`;
        tokens.splice(i, 3, t);
      }
    }
  });

  // Source line mapping — every block-level element carries data-line
  // (1-based) so the preview can follow the editor cursor precisely.
  // Headings additionally carry data-edit-line so the flow preview can
  // offer inline editing that writes straight back to that source line.
  md.core.ruler.push("studio_line_map", (state) => {
    for (const token of state.tokens) {
      if (token.map && token.nesting === 1) {
        const line = String(token.map[0] + 1);
        token.attrSet("data-line", line);
        if (token.type === "heading_open" && ["h1", "h2", "h3"].includes(token.tag)) {
          token.attrSet("data-edit-line", line);
        }
      }
    }
  });

  // External links open in a new tab in previews; PDFs keep them clickable.
  const defaultLink =
    md.renderer.rules.link_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet("href") || "";
    if (/^https?:/i.test(href)) {
      tokens[idx].attrSet("target", "_blank");
      tokens[idx].attrSet("rel", "noopener");
    }
    return defaultLink(tokens, idx, options, env, self);
  };

  return md;
}

export function renderMarkdown(body: string): string {
  return getRenderer().render(body);
}

export function renderInline(text: string): string {
  return getRenderer().renderInline(text);
}

/* ── Table of contents ─────────────────────────────────────────────── */

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

export function extractToc(body: string): TocItem[] {
  const tokens = getRenderer().parse(body, {});
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "heading_open" && ["h1", "h2", "h3"].includes(t.tag)) {
      const inline = tokens[i + 1];
      const text = inline?.children
        ? inline.children
            .filter((c) => c.type === "text" || c.type === "code_inline")
            .map((c) => c.content)
            .join("")
        : (inline?.content ?? "");
      let id = slugify(text);
      const n = seen.get(id) || 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n}`;
      toc.push({ level: Number(t.tag[1]), text, id });
    }
  }
  return toc;
}
