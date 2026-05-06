import { promisify } from "util";
import path from "path";
import fs from "fs";
import { logger } from "../utils/logger";

/**
 * Per Review 1.5 follow-up (2026-05-07): the agent + customer want the PDF
 * download of a generated Word contract to look IDENTICAL to the .docx —
 * fonts, tables, headers, footers, embedded images. The previous client-side
 * approach (html2pdf rasterising the docx-preview DOM) loses fidelity because
 * it captures via html2canvas.
 *
 * The robust route is to run the same conversion Word does internally, by
 * shelling out to a headless LibreOffice / soffice process. The
 * `libreoffice-convert` package handles the temp-file dance and binary
 * lookup. Its native call is callback-style; we wrap with `promisify` for
 * async/await.
 *
 * Deployment requirement: `soffice` must be on PATH (or set
 * LIBREOFFICE_PATH). On macOS dev, install LibreOffice from the official
 * site and add `/Applications/LibreOffice.app/Contents/MacOS` to PATH.
 * On Debian/Ubuntu prod (e.g. Render.com): `apt-get install libreoffice`
 * during the build step.
 */

// libreoffice-convert ships its own d.ts only in newer versions; fall back to
// require + manual typing if the import shape is unexpected.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = require("libreoffice-convert") as {
  convert: (
    buffer: Buffer,
    format: string,
    filter: string | undefined,
    cb: (err: Error | null, done: Buffer) => void
  ) => void;
};

const convertAsync = promisify(lib.convert) as (
  buffer: Buffer,
  format: string,
  filter: string | undefined
) => Promise<Buffer>;

export class LibreOfficeUnavailableError extends Error {
  constructor() {
    super(
      "LibreOffice / soffice binary not found on the server. Install LibreOffice and ensure `soffice` is on PATH (set LIBREOFFICE_PATH if you keep it elsewhere)."
    );
    this.name = "LibreOfficeUnavailableError";
  }
}

/**
 * Convert a .docx buffer into a PDF buffer using headless LibreOffice. Throws
 * `LibreOfficeUnavailableError` if soffice isn't installed — the caller can
 * surface a 503 + invite the client to fall back.
 */
export async function docxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  try {
    return await convertAsync(docxBuffer, ".pdf", undefined);
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (
      /enoent|spawn|libre[- ]?office|soffice|cannot find|not installed/i.test(msg)
    ) {
      logger.warn({ err }, "LibreOffice unavailable for PDF conversion");
      throw new LibreOfficeUnavailableError();
    }
    throw err;
  }
}

/**
 * On-disk cache for converted PDFs. Keyed by source path + size + mtime so
 * any change to the .docx invalidates the cached PDF automatically.
 */
const PDF_CACHE_ROOT = path.resolve(process.cwd(), "uploads", ".pdf-cache");
if (!fs.existsSync(PDF_CACHE_ROOT)) fs.mkdirSync(PDF_CACHE_ROOT, { recursive: true });

function cacheKey(absDocxPath: string, stat: fs.Stats): string {
  // Crypto-light: filename + size + mtime epoch is stable enough.
  const safe = path
    .basename(absDocxPath)
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safe}-${stat.size}-${stat.mtimeMs.toFixed(0)}.pdf`;
}

export async function docxFileToPdfWithCache(absDocxPath: string): Promise<Buffer> {
  if (!fs.existsSync(absDocxPath)) {
    throw new Error(`Source .docx not found at ${absDocxPath}`);
  }
  const stat = fs.statSync(absDocxPath);
  const cachedPath = path.join(PDF_CACHE_ROOT, cacheKey(absDocxPath, stat));
  if (fs.existsSync(cachedPath)) {
    return fs.readFileSync(cachedPath);
  }
  const docxBuffer = fs.readFileSync(absDocxPath);
  const pdfBuffer = await docxToPdf(docxBuffer);
  try {
    fs.writeFileSync(cachedPath, pdfBuffer);
  } catch (err) {
    logger.warn({ err, cachedPath }, "Failed to cache converted PDF (continuing)");
  }
  return pdfBuffer;
}
