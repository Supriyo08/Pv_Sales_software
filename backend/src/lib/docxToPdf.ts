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

export class LibreOfficeUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `LibreOffice unavailable for PDF conversion (${reason}). The server falls back to client-side rasterised PDF. Install LibreOffice and the npm 'libreoffice-convert' package to enable byte-perfect Word→PDF conversion.`
    );
    this.name = "LibreOfficeUnavailableError";
  }
}

/**
 * Lazy-load `libreoffice-convert` ONLY when someone actually requests a PDF.
 * The package is optional — production hosts without LibreOffice (e.g. the
 * default Render Node image) shouldn't crash on boot just because the
 * conversion endpoint exists. Caller catches `LibreOfficeUnavailableError`
 * and surfaces a 503; frontend then transparently falls back to its own
 * client-side PDF rasterisation.
 *
 * Cached after the first successful require so repeated downloads don't pay
 * the lookup cost.
 */
type LibreOfficeConvert = {
  convert: (
    buffer: Buffer,
    format: string,
    filter: string | undefined,
    cb: (err: Error | null, done: Buffer) => void
  ) => void;
};

let convertAsync:
  | ((buffer: Buffer, format: string, filter: string | undefined) => Promise<Buffer>)
  | null
  | undefined;

function getConvertAsync(): typeof convertAsync {
  if (convertAsync !== undefined) return convertAsync;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require("libreoffice-convert") as LibreOfficeConvert;
    convertAsync = promisify(lib.convert) as NonNullable<typeof convertAsync>;
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message },
      "libreoffice-convert package not installed — server-side PDF conversion disabled"
    );
    convertAsync = null;
  }
  return convertAsync;
}

/**
 * Convert a .docx buffer into a PDF buffer using headless LibreOffice. Throws
 * `LibreOfficeUnavailableError` if either the npm package or the soffice
 * binary is missing — the caller surfaces a 503 + invites the client to fall
 * back to its rasterised path.
 */
export async function docxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const convert = getConvertAsync();
  if (!convert) {
    throw new LibreOfficeUnavailableError("npm package not installed");
  }
  try {
    return await convert(docxBuffer, ".pdf", undefined);
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (
      /enoent|spawn|libre[- ]?office|soffice|cannot find|not installed/i.test(msg)
    ) {
      logger.warn({ err }, "soffice binary missing");
      throw new LibreOfficeUnavailableError("soffice binary missing on host");
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
