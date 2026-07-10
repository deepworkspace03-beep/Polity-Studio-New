import { PDFDocument } from "pdf-lib";
import { transcribePaginated } from "./transcribe";

/**
 * The PDF export engine — public entry point.
 *
 * Takes the already-paginated Publish/preview iframe document and
 * produces a downloadable vector PDF: real selectable text, subset
 * fonts, vector artwork, clickable links, document outline. Runs
 * entirely in the browser; no print dialog involved.
 */

export interface ExportMeta {
  title: string;
  author?: string;
  subject?: string;
  lang?: string;
}

export interface ExportResult {
  blob: Blob;
  pages: number;
  bytes: number;
  warnings: string[];
}

export async function exportPaginatedPdf(
  srcDoc: Document,
  meta: ExportMeta,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(meta.title, { showInWindowTitleBar: true });
  if (meta.author) pdf.setAuthor(meta.author);
  if (meta.subject) pdf.setSubject(meta.subject);
  if (meta.lang) pdf.setLanguage(meta.lang);
  pdf.setCreator("Polity Studio");
  pdf.setProducer("Polity Studio PDF engine");
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());

  const { pages, warnings } = await transcribePaginated(srcDoc, pdf, onProgress);
  if (warnings.length) console.warn("[pdf] transcription warnings:", warnings);

  const bytes = await pdf.save({ useObjectStreams: true });
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  return { blob, pages, bytes: bytes.length, warnings };
}
