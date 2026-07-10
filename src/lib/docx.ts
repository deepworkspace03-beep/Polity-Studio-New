import { newTally, summarize, wrap, type Tally } from "./importTally";

/**
 * DOCX → Markdown, dependency-free.
 *
 * A .docx is a ZIP of XML parts. Rather than pull in a zip library, this
 * reads the ZIP central directory by hand (docx files never need Zip64
 * or split archives) and inflates entries with the browser's own
 * `DecompressionStream("deflate-raw")` — no dependency at all, on
 * evergreen browsers. `word/document.xml` is WordprocessingML; it gets
 * the same "walk and serialize" treatment as the HTML importer, plus a
 * best-effort read of `numbering.xml` (bullet vs. ordered) and
 * `document.xml.rels` (hyperlink targets).
 *
 * List numbering is approximate: Word's real numbering model tracks
 * per-level restarts we don't parse (`w:lvlOverride`), so consecutive
 * items under the same numId/level just count up and reset on the next
 * non-empty non-list paragraph. Good enough to paste and skim-fix,
 * consistent with the rest of Smart Import's "conservative, editable"
 * philosophy.
 */

export function isDocxSupported(): boolean {
  return typeof DecompressionStream !== "undefined";
}

/* ── Minimal ZIP reader ───────────────────────────────────────────── */

const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const EOCD_SIG = 0x06054b50;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function findEocd(view: DataView): number {
  const scanBack = Math.min(view.byteLength, 65557);
  for (let i = view.byteLength - 22; i >= view.byteLength - scanBack; i--) {
    if (i < 0) break;
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new Error("Not a valid .docx file");
}

function parseCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  let p = view.getUint32(eocd + 16, true);
  const total = view.getUint16(eocd + 10, true);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  for (let i = 0; i < total && p + 46 <= bytes.length; i++) {
    if (view.getUint32(p, true) !== CDH_SIG) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entry.localHeaderOffset;
  if (view.getUint32(p, true) !== LFH_SIG) throw new Error("Corrupt .docx archive");
  const nameLen = view.getUint16(p + 26, true);
  const extraLen = view.getUint16(p + 28, true);
  const dataStart = p + 30 + nameLen + extraLen;
  const raw = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error("Unsupported compression in .docx archive");
  const stream = new Blob([raw.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipText(bytes: Uint8Array, entries: ZipEntry[], name: string): Promise<string | null> {
  const entry = entries.find((e) => e.name === name);
  if (!entry) return null;
  const data = await inflateEntry(bytes, entry);
  return new TextDecoder("utf-8").decode(data);
}

/* ── WordprocessingML → Markdown ─────────────────────────────────── */

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function parseRelationships(xml: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml) return map;
  for (const rel of Array.from(parseXml(xml).getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

/** numId → ilvl → is-this-level-a-bullet (vs. ordered). */
type NumberingMap = Map<string, Map<number, boolean>>;

function parseNumbering(xml: string | null): NumberingMap {
  const map: NumberingMap = new Map();
  if (!xml) return map;
  const doc = parseXml(xml);
  const abstractLevels = new Map<string, Map<number, boolean>>();
  for (const abs of Array.from(doc.getElementsByTagName("w:abstractNum"))) {
    const absId = abs.getAttribute("w:abstractNumId");
    if (!absId) continue;
    const levels = new Map<number, boolean>();
    for (const lvl of Array.from(abs.getElementsByTagName("w:lvl"))) {
      const ilvl = Number(lvl.getAttribute("w:ilvl") || "0");
      const fmt = lvl.getElementsByTagName("w:numFmt")[0]?.getAttribute("w:val") || "decimal";
      levels.set(ilvl, fmt === "bullet");
    }
    abstractLevels.set(absId, levels);
  }
  for (const num of Array.from(doc.getElementsByTagName("w:num"))) {
    const numId = num.getAttribute("w:numId");
    const absId = num.getElementsByTagName("w:abstractNumId")[0]?.getAttribute("w:val");
    if (numId && absId && abstractLevels.has(absId)) map.set(numId, abstractLevels.get(absId)!);
  }
  return map;
}

function runText(run: Element): string {
  let out = "";
  for (const child of Array.from(run.children)) {
    if (child.tagName === "w:t") out += child.textContent || "";
    else if (child.tagName === "w:tab") out += "\t";
    else if (child.tagName === "w:br" || child.tagName === "w:cr") out += "\\\n";
  }
  return out;
}

function runFlag(rPr: Element | undefined, tag: string): boolean {
  const el = rPr?.getElementsByTagName(tag)[0];
  if (!el) return false;
  const val = el.getAttribute("w:val");
  return val !== "0" && val !== "false" && val !== "none";
}

function runFormatted(run: Element): string {
  const text = runText(run);
  if (!text.trim()) return text;
  const rPr = run.getElementsByTagName("w:rPr")[0];
  let out = text;
  if (runFlag(rPr, "w:i")) out = wrap(out, "*");
  if (runFlag(rPr, "w:b")) out = wrap(out, "**");
  if (runFlag(rPr, "w:u")) out = wrap(out, "++");
  if (runFlag(rPr, "w:strike")) out = wrap(out, "~~");
  return out;
}

function paragraphInline(p: Element, rels: Map<string, string>, t: Tally): string {
  let out = "";
  for (const child of Array.from(p.children)) {
    if (child.tagName === "w:r") out += runFormatted(child);
    else if (child.tagName === "w:hyperlink") {
      const href = rels.get(child.getAttribute("r:id") || "");
      const inner = Array.from(child.getElementsByTagName("w:r")).map(runFormatted).join("");
      if (href && inner.trim()) {
        t.links++;
        out += `[${inner.trim()}](${href})`;
      } else out += inner;
    }
  }
  return out;
}

function pStyleId(p: Element): string | null {
  return p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") || null;
}

function headingLevel(style: string | null): number | null {
  if (!style) return null;
  if (/^title$/i.test(style)) return 1;
  const m = /^Heading(\d)$/i.exec(style);
  return m ? Math.min(6, Number(m[1])) : null;
}

function paragraphNumbering(p: Element): { numId: string; ilvl: number } | null {
  const numPr = p.getElementsByTagName("w:pPr")[0]?.getElementsByTagName("w:numPr")[0];
  if (!numPr) return null;
  const numId = numPr.getElementsByTagName("w:numId")[0]?.getAttribute("w:val");
  const ilvl = Number(numPr.getElementsByTagName("w:ilvl")[0]?.getAttribute("w:val") || "0");
  return numId ? { numId, ilvl } : null;
}

function tableToMarkdown(tbl: Element, rels: Map<string, string>, t: Tally): string {
  const rows: string[][] = [];
  for (const tr of Array.from(tbl.getElementsByTagName("w:tr"))) {
    const cells: string[] = [];
    for (const tc of Array.from(tr.children).filter((c) => c.tagName === "w:tc")) {
      const text = Array.from(tc.getElementsByTagName("w:p"))
        .map((p) => paragraphInline(p, rels, t).trim())
        .filter(Boolean)
        .join(" ");
      cells.push(text.replace(/\|/g, "\\|"));
    }
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return "";
  t.tables++;
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => "| " + Array.from({ length: width }, (_, i) => r[i] || "").join(" | ") + " |";
  return [line(rows[0]), "| " + Array(width).fill("---").join(" | ") + " |", ...rows.slice(1).map(line)].join("\n");
}

export interface DocxResult {
  markdown: string;
  summary: string;
}

export async function docxToMarkdown(buffer: ArrayBuffer): Promise<DocxResult> {
  if (!isDocxSupported()) throw new Error("Word (.docx) import needs a newer browser.");
  const bytes = new Uint8Array(buffer);
  const entries = parseCentralDirectory(bytes);
  const documentXml = await readZipText(bytes, entries, "word/document.xml");
  if (!documentXml) throw new Error("Not a valid Word (.docx) file");
  const [relsXml, numberingXml] = await Promise.all([
    readZipText(bytes, entries, "word/_rels/document.xml.rels"),
    readZipText(bytes, entries, "word/numbering.xml"),
  ]);
  const rels = parseRelationships(relsXml);
  const numbering = parseNumbering(numberingXml);

  const body = parseXml(documentXml).getElementsByTagName("w:body")[0];
  if (!body) throw new Error("Word document has no content");

  const t = newTally();
  const blocks: string[] = [];
  const counters = new Map<string, number>();

  for (const node of Array.from(body.children)) {
    if (node.tagName === "w:tbl") {
      counters.clear();
      const md = tableToMarkdown(node, rels, t);
      if (md) blocks.push(md);
      continue;
    }
    if (node.tagName !== "w:p") continue;

    const level = headingLevel(pStyleId(node));
    const text = paragraphInline(node, rels, t).trim();

    if (level) {
      counters.clear();
      if (text) {
        t.headings++;
        blocks.push("#".repeat(level) + " " + text);
      }
      continue;
    }

    const np = paragraphNumbering(node);
    if (np && text) {
      t.listItems++;
      const key = `${np.numId}:${np.ilvl}`;
      const bullet = numbering.get(np.numId)?.get(np.ilvl) ?? true;
      const indent = "  ".repeat(np.ilvl);
      if (bullet) {
        blocks.push(`${indent}- ${text}`);
      } else {
        const n = (counters.get(key) || 0) + 1;
        counters.set(key, n);
        blocks.push(`${indent}${n}. ${text}`);
      }
      continue;
    }

    if (text) {
      counters.clear();
      blocks.push(text);
    }
  }

  const markdown = blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return { markdown, summary: summarize("Word (.docx) content", t) };
}
