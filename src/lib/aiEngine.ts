import type { TemplateId } from "./types";

/**
 * The one and only bridge to Polity AI Engine — the separate document-
 * understanding service (its own repo, its own Railway deployment). Studio
 * knows nothing about parsers, OCR or Docling; it knows this service's URL,
 * that it can upload a document, poll a job, and receive normalized
 * Markdown back. Every parser-specific concern lives behind the HTTP API.
 *
 * This is the deliberate exception to the "no backend, no fetch" rule
 * (CLAUDE.md): the engine is an independent external service, not a
 * first-party endpoint baked into the static app, and the whole feature is
 * inert until a user configures its URL in Settings. With no URL set,
 * nothing here runs and import behaves exactly as it always has.
 */

export interface EngineBlock {
  type: string;
  text: string;
  level: number | null;
  page: number | null;
}

export interface EngineMetadata {
  page_count: number | null;
  language: string | null;
  title: string | null;
  table_count: number;
  image_count: number;
}

export interface NormalizedDocument {
  markdown: string;
  blocks: EngineBlock[];
  metadata: EngineMetadata;
  engine: string;
}

type JobStatus = "queued" | "processing" | "completed" | "failed";

interface JobCreated {
  job_id: string;
  status: JobStatus;
}

interface JobState {
  job_id: string;
  status: JobStatus;
  progress: number;
  stage: string;
  engine: string | null;
  error: string | null;
  result: NormalizedDocument | null;
}

interface EnginesInfo {
  capabilities: string[];
  extensions: string[];
}

export class AiEngineError extends Error {}

/** File types Studio hands to the engine: the ones it can't understand
    itself (scans, PDFs, images, slides). DOCX/HTML/text stay on Studio's
    instant, offline native path — no round-trip, no engine required. */
const ENGINE_FORMATS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "tiff",
  "tif",
  "bmp",
  "webp",
  "pptx",
]);

export const ENGINE_ACCEPT = [...ENGINE_FORMATS].map((e) => `.${e}`).join(",");

export function aiEngineConfigured(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url.trim());
}

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Extensions the engine handles that Studio would otherwise reject. Used
    to decide whether a picked/dropped file should be routed to the engine. */
export function engineHandles(ext: string): boolean {
  return ENGINE_FORMATS.has(ext.toLowerCase().replace(/^\./, ""));
}

async function readError(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as { error?: string; detail?: string };
    return body.detail ? `${body.error}: ${body.detail}` : body.error || resp.statusText;
  } catch {
    return resp.statusText || `HTTP ${resp.status}`;
  }
}

/** Confirms the service is reachable and reports what it can handle — used
    by the Settings "Test connection" affordance. */
export async function fetchEngineInfo(baseUrl: string): Promise<EnginesInfo> {
  const resp = await fetch(`${normalizeBase(baseUrl)}/v1/engines`);
  if (!resp.ok) throw new AiEngineError(await readError(resp));
  return (await resp.json()) as EnginesInfo;
}

export interface ProcessProgress {
  fraction: number;
  stage: string;
}

const POLL_INTERVAL_MS = 800;
const MAX_WAIT_MS = 5 * 60 * 1000;

/** Uploads a document, waits for the engine to finish, and returns the
    normalized result. Polls with a bounded total wait so a stuck job can't
    hang the UI forever. */
export async function processDocument(
  baseUrl: string,
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<NormalizedDocument> {
  const base = normalizeBase(baseUrl);
  const form = new FormData();
  form.append("file", file, file.name);

  const created = await fetch(`${base}/v1/documents`, { method: "POST", body: form });
  if (!created.ok) throw new AiEngineError(await readError(created));
  const { job_id } = (await created.json()) as JobCreated;

  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    const resp = await fetch(`${base}/v1/documents/${job_id}`);
    if (!resp.ok) throw new AiEngineError(await readError(resp));
    const job = (await resp.json()) as JobState;
    onProgress?.({ fraction: job.progress, stage: job.stage });

    if (job.status === "completed" && job.result) return job.result;
    if (job.status === "failed") throw new AiEngineError(job.error || "processing failed");
    if (Date.now() > deadline) throw new AiEngineError("processing timed out");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** A human one-liner for the Import Review summary, from the engine's
    metadata — mirrors the tone of the native importer's summaries. */
export function describeResult(doc: NormalizedDocument, filename: string): string {
  const kind = filename.split(".").pop()?.toUpperCase() || "document";
  const parts: string[] = [];
  if (doc.metadata.page_count) parts.push(`${doc.metadata.page_count} pages`);
  if (doc.metadata.table_count) parts.push(`${doc.metadata.table_count} tables`);
  if (doc.metadata.image_count) parts.push(`${doc.metadata.image_count} images`);
  return parts.length ? `Converted ${kind} — ${parts.join(", ")}` : `Converted ${kind}`;
}

/** The injectable processor the importer uses for non-native files, so
    lib/importer.ts stays dependency-free and unaware of the network. */
export interface DocumentProcessor {
  supports(ext: string): boolean;
  process(
    file: File,
    onProgress?: (p: ProcessProgress) => void,
  ): Promise<{ markdown: string; summary: string; suggested?: TemplateId }>;
}

export function createEngineProcessor(url: string | undefined): DocumentProcessor | null {
  if (!aiEngineConfigured(url)) return null;
  return {
    supports: engineHandles,
    async process(file, onProgress) {
      const doc = await processDocument(url, file, onProgress);
      return { markdown: doc.markdown, summary: describeResult(doc, file.name) };
    },
  };
}
