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
type BackendErrorKind = "unsupported" | "memory" | "engine_error";

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
  error_kind: BackendErrorKind | null;
  result: NormalizedDocument | null;
}

interface EnginesInfo {
  capabilities: string[];
  extensions: string[];
}

/** Every way processing can fail, named precisely at the point each is
    detected — never guessed afterwards from a message string. Studio's
    UI (ImportReview) maps each to a specific, honest explanation instead
    of a generic "Failed to fetch". */
export type FailureKind =
  | "network" // couldn't reach the engine at all (offline, wrong URL, CORS)
  | "too_large" // the file exceeds the engine's upload limit
  | "unsupported" // the engine can't understand this document
  | "memory" // the engine ran out of memory processing this document
  | "timeout" // processing didn't finish within the client's wait budget
  | "server" // the engine returned an unexpected server error
  | "unknown";

export class AiEngineError extends Error {
  kind: FailureKind;
  constructor(message: string, kind: FailureKind = "unknown") {
    super(message);
    this.kind = kind;
  }
}

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

/** Maps an HTTP failure response to a specific kind — the engine's own
    {error, detail} envelope (see its ARCHITECTURE.md) carries the actual
    reason, so this never has to guess from a status code alone. */
async function readError(resp: Response): Promise<AiEngineError> {
  let message = resp.statusText || `HTTP ${resp.status}`;
  try {
    const body = (await resp.json()) as { error?: string; detail?: string };
    message = body.detail ? `${body.error}: ${body.detail}` : body.error || message;
  } catch {
    // Non-JSON error body (e.g. a proxy's plain-text 502) — keep statusText.
  }
  const kind: FailureKind =
    resp.status === 413 ? "too_large" : resp.status === 415 ? "unsupported" : resp.status >= 500 ? "server" : "unknown";
  return new AiEngineError(message, kind);
}

/** Every `fetch` to the engine goes through this so a network-level
    failure (offline, wrong URL, CORS, DNS) becomes a specific
    `AiEngineError` — never a raw "Failed to fetch" TypeError bubbling up
    from the browser. */
async function engineFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new AiEngineError(
      "couldn't reach the AI Engine — check your connection or the engine URL in Settings",
      "network",
    );
  }
}

/** Confirms the service is reachable and reports what it can handle — used
    by the Settings "Test connection" affordance. */
export async function fetchEngineInfo(baseUrl: string): Promise<EnginesInfo> {
  const resp = await engineFetch(`${normalizeBase(baseUrl)}/v1/engines`);
  if (!resp.ok) throw await readError(resp);
  return (await resp.json()) as EnginesInfo;
}

export interface ProcessProgress {
  fraction: number;
  stage: string;
}

const POLL_INTERVAL_MS = 800;
const MAX_WAIT_MS = 5 * 60 * 1000;

const BACKEND_ERROR_KIND: Record<BackendErrorKind, FailureKind> = {
  unsupported: "unsupported",
  memory: "memory",
  engine_error: "server",
};

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

  const created = await engineFetch(`${base}/v1/documents`, { method: "POST", body: form });
  if (!created.ok) throw await readError(created);
  const { job_id } = (await created.json()) as JobCreated;

  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    const resp = await engineFetch(`${base}/v1/documents/${job_id}`);
    if (!resp.ok) throw await readError(resp);
    const job = (await resp.json()) as JobState;
    onProgress?.({ fraction: job.progress, stage: job.stage });

    if (job.status === "completed" && job.result) return job.result;
    if (job.status === "failed") {
      const kind = job.error_kind ? BACKEND_ERROR_KIND[job.error_kind] : "unknown";
      throw new AiEngineError(job.error || "processing failed", kind);
    }
    if (Date.now() > deadline) {
      throw new AiEngineError(
        "processing is taking longer than expected and was stopped — the document may be too large or complex",
        "timeout",
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** Maps the engine's real, reported stage strings to the copy shown in
    Studio's processing dialog. Only stages the engine actually reports
    appear here — inventing steps it never signals would be its own kind
    of vague/misleading UI. An unrecognized future stage still renders
    (humanized) rather than showing nothing. */
const STAGE_LABELS: Record<string, string> = {
  queued: "Waiting to start…",
  processing: "Processing document…",
  reading: "Reading document…",
  structuring: "Structuring content…",
  "loading engine": "Waking the AI Engine…",
  "analyzing layout": "Detecting layout and extracting text…",
  "generating markdown": "Generating Markdown…",
  done: "Completed successfully",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] || stage.charAt(0).toUpperCase() + stage.slice(1);
}

export interface FailureInfo {
  title: string;
  message: string;
  suggestion: string;
}

/** Turns a categorized failure into the three lines Studio's error dialog
    shows: what failed, why, and what to try next. Every branch names a
    concrete cause — no "Failed to fetch", no "Not Cached". */
export function describeFailure(err: unknown): FailureInfo {
  const kind: FailureKind = err instanceof AiEngineError ? err.kind : "unknown";
  const detail = err instanceof Error ? err.message : String(err);
  switch (kind) {
    case "network":
      return {
        title: "Couldn't reach the AI Engine",
        message: "This looks like a network issue — Studio couldn't connect to the document-processing service at all.",
        suggestion: "Check your internet connection, then confirm the engine URL in Settings → Smart Import engine is correct and the service is running.",
      };
    case "too_large":
      return {
        title: "File too large",
        message: "This file is bigger than the AI Engine's upload limit.",
        suggestion: "Try a smaller file, or a lower-resolution scan.",
      };
    case "unsupported":
      return {
        title: "Couldn't process this file",
        message: detail || "The AI Engine couldn't extract any content from this document.",
        suggestion: "Check the file isn't corrupted or password-protected. Different file types are supported natively (Word, HTML, text) without the engine at all.",
      };
    case "memory":
      return {
        title: "Ran out of memory",
        message: "The AI Engine ran out of memory while processing this document — this document needed more resources than the server currently has available.",
        suggestion: "Try a smaller or simpler file (fewer pages, lower-resolution scan), or ask whoever manages the engine to increase its server memory.",
      };
    case "timeout":
      return {
        title: "Processing timed out",
        message: "The document didn't finish processing in a reasonable time.",
        suggestion: "Large scanned books can take a while — try again, or split the file into smaller parts.",
      };
    case "server":
      return {
        title: "AI Engine crashed",
        message: detail || "The AI Engine hit an unexpected server error while processing this document.",
        suggestion: "Try again in a moment. If it keeps happening, the service may need attention.",
      };
    default:
      return {
        title: "Processing failed",
        message: detail || "Something went wrong while processing this document.",
        suggestion: "Try again, or try a different file.",
      };
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
