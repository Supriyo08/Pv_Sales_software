import path from "path";
import fs from "fs";
import PizZip from "pizzip";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ContractTemplate } from "./template.model";
import { HttpError } from "../../middleware/error";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const TEMPLATE_DIR = path.join(UPLOAD_ROOT, "templates");
if (!fs.existsSync(TEMPLATE_DIR)) fs.mkdirSync(TEMPLATE_DIR, { recursive: true });

export type Placeholder = {
  tag: string;
  count: number;
};

export type OptionalSection = {
  id: string;
  label: string;
};

export type TemplateAnalysis = {
  placeholders: Placeholder[];
  sections: OptionalSection[];
};

// Per follow-up to Review 1.1 (2026-05-02): placeholders use a DOUBLE-@ prefix
// (`@@tag`). This prevents conflicts with literal email addresses like
// `info@edilteca.it` that previously matched the single-@ regex incorrectly.
const PLACEHOLDER_RE = /@@([a-zA-Z_][a-zA-Z0-9_]*)/g;
const SECTION_OPEN_RE = /\[\[OPTIONAL:([a-zA-Z_][a-zA-Z0-9_]*)(?:\|([^\]]+))?\]\]/g;
const SECTION_PAIR_RE =
  /\[\[OPTIONAL:([a-zA-Z_][a-zA-Z0-9_]*)(?:\|([^\]]+))?\]\]([\s\S]*?)\[\[\/OPTIONAL\]\]/g;

export function analyze(body: string): TemplateAnalysis {
  const placeholderMap = new Map<string, number>();
  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    const tag = match[1]!;
    placeholderMap.set(tag, (placeholderMap.get(tag) ?? 0) + 1);
  }

  const sectionsMap = new Map<string, string>();
  for (const match of body.matchAll(SECTION_OPEN_RE)) {
    const id = match[1]!;
    const label = match[2] ?? id;
    if (!sectionsMap.has(id)) sectionsMap.set(id, label);
  }

  return {
    placeholders: [...placeholderMap.entries()].map(([tag, count]) => ({ tag, count })),
    sections: [...sectionsMap.entries()].map(([id, label]) => ({ id, label: label.trim() })),
  };
}

/**
 * Per Review 1.1 §2: templates may now be authored as HTML (via TipTap) or .docx
 * imports converted to HTML. We strip tags here so renderToPdf gets plain text
 * with sensible block-level whitespace. Bold/italic visual fidelity is lost in
 * the v1.2 PDF; full WYSIWYG (Puppeteer) is on the v1.3 backlog.
 *
 * Heuristic: if body contains "<" + alpha, treat as HTML — otherwise pass through.
 * Cheerio is loaded lazily so plain-text templates don't pay for it.
 */
function htmlToText(input: string): string {
  if (!/<[a-zA-Z]/.test(input)) return input;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cheerio = require("cheerio") as typeof import("cheerio");
  const $ = cheerio.load(`<root>${input}</root>`, {
    xml: { decodeEntities: true },
  });

  // Insert newlines around block-level elements before we extract text.
  const blocks = "h1,h2,h3,h4,h5,h6,p,div,blockquote,ul,ol,pre,br,hr";
  $(blocks).each((_i, el) => {
    const tag = (el as { tagName?: string }).tagName ?? "";
    if (tag === "br") {
      $(el).replaceWith("\n");
    } else if (tag === "hr") {
      $(el).replaceWith("\n----------\n");
    } else if (tag === "li") {
      // handled by `li` selector below
    } else {
      $(el).prepend("\n").append("\n");
    }
  });
  $("li").each((_i, el) => {
    $(el).prepend("• ").append("\n");
  });

  const text = $("root").text();
  return text.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function render(
  body: string,
  values: Record<string, string>,
  omitSections: string[]
): string {
  const omitSet = new Set(omitSections);

  // Strip omitted sections (marker + content + closing marker)
  let rendered = body.replace(SECTION_PAIR_RE, (full, id, _label, content) => {
    return omitSet.has(id) ? "" : content;
  });

  // Strip any leftover unpaired markers (defensive)
  rendered = rendered
    .replace(/\[\[OPTIONAL:[^\]]+\]\]/g, "")
    .replace(/\[\[\/OPTIONAL\]\]/g, "");

  // Substitute @tag with values; missing values become "[[tag]]" so they stand out.
  rendered = rendered.replace(PLACEHOLDER_RE, (_, tag) => {
    const v = values[tag];
    return v === undefined || v === null || v === "" ? `[[${tag}]]` : v;
  });

  // If body was authored as HTML (TipTap / .docx import), convert to plain text
  // for downstream PDF rendering and JSON preview consistency.
  rendered = htmlToText(rendered);

  // Collapse 3+ newlines into 2 (cleanup after omitting sections)
  rendered = rendered.replace(/\n{3,}/g, "\n\n").trim();

  return rendered;
}

// ─── PDF rendering ──────────────────────────────────────────────────────────
// pdf-lib's StandardFonts use WinAnsi (CP1252), which covers the vast majority
// of Western European characters including €, è, à, ò, ù, ñ, ß, etc.
// We sanitize a small set of common non-CP1252 punctuation to safe equivalents.

const CP1252_SUBS: Array<[RegExp, string]> = [
  [/[“”]/g, '"'],
  [/[‘’]/g, "'"],
  [/[—–]/g, "-"],
  [/…/g, "..."],
  [/ /g, " "],
  [/​/g, ""],
];

function toCp1252Safe(text: string): string {
  let out = text;
  for (const [re, sub] of CP1252_SUBS) out = out.replace(re, sub);
  // Fallback for anything still outside Latin-1
  return [...out]
    .map((ch) => (ch.charCodeAt(0) > 255 ? "?" : ch))
    .join("");
}

function wrapTextToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  if (text === "") return [""];
  const words = text.split(/(\s+)/); // keep whitespace tokens for width math
  const lines: string[] = [];
  let line = "";
  for (const tok of words) {
    const candidate = line + tok;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line.length > 0) lines.push(line.trimEnd());
      // If a single token is wider than maxWidth, hard-break it
      if (font.widthOfTextAtSize(tok, size) > maxWidth) {
        let buf = "";
        for (const ch of tok) {
          if (font.widthOfTextAtSize(buf + ch, size) > maxWidth) {
            lines.push(buf);
            buf = ch;
          } else {
            buf += ch;
          }
        }
        line = buf;
      } else {
        line = tok.trimStart();
      }
    }
  }
  if (line.length > 0) lines.push(line.trimEnd());
  return lines;
}

export async function renderToPdf(text: string, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toCp1252Safe(title));
  doc.setProducer("PV Sales Platform");
  doc.setCreator("PV Sales Platform");
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // A4: 595.28 × 841.89 pt
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 56; // ~2cm
  const titleSize = 16;
  const bodySize = 11;
  const lineHeight = 14;
  const safeTitle = toCp1252Safe(title);
  const safeBody = toCp1252Safe(text);

  let page: PDFPage = doc.addPage(pageSize);
  let y = page.getHeight() - margin;
  const maxWidth = page.getWidth() - 2 * margin;

  // Title
  page.drawText(safeTitle, {
    x: margin,
    y,
    size: titleSize,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });
  y -= titleSize + 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: page.getWidth() - margin, y },
    thickness: 0.5,
    color: rgb(0.85, 0.86, 0.89),
  });
  y -= 18;

  const advance = (need = lineHeight) => {
    if (y - need < margin) {
      page = doc.addPage(pageSize);
      y = page.getHeight() - margin;
    }
  };

  for (const rawLine of safeBody.split("\n")) {
    if (rawLine.trim() === "") {
      y -= lineHeight * 0.6; // smaller blank
      advance();
      continue;
    }
    const wrapped = wrapTextToWidth(rawLine, font, bodySize, maxWidth);
    for (const w of wrapped) {
      advance();
      page.drawText(w, {
        x: margin,
        y,
        size: bodySize,
        font,
        color: rgb(0.1, 0.12, 0.18),
      });
      y -= lineHeight;
    }
  }

  // Footer on every page
  const pageCount = doc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = doc.getPage(i);
    p.drawText(
      `${safeTitle}  ·  page ${i + 1} / ${pageCount}  ·  generated ${new Date().toISOString().slice(0, 10)}`,
      {
        x: margin,
        y: 24,
        size: 8,
        font,
        color: rgb(0.55, 0.58, 0.65),
      }
    );
  }

  return doc.save();
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "contract";
}

export async function list() {
  return ContractTemplate.find({ deletedAt: null }).sort({ updatedAt: -1 });
}

export async function getById(id: string) {
  const t = await ContractTemplate.findOne({ _id: id, deletedAt: null });
  if (!t) throw new HttpError(404, "Template not found");
  return t;
}

export async function create(input: {
  name: string;
  description?: string;
  body: string;
  active?: boolean;
  solutionIds?: string[];
  sourceDocxPath?: string | null;
  createdBy: string;
}) {
  const exists = await ContractTemplate.findOne({ name: input.name, deletedAt: null });
  if (exists) throw new HttpError(409, "Template with this name already exists");
  return ContractTemplate.create({
    name: input.name,
    description: input.description ?? "",
    body: input.body,
    active: input.active ?? true,
    solutionIds: input.solutionIds ?? [],
    sourceDocxPath: input.sourceDocxPath ?? null,
    createdBy: input.createdBy,
  });
}

export async function update(
  id: string,
  input: Partial<{
    name: string;
    description: string;
    body: string;
    active: boolean;
    solutionIds: string[];
  }>
) {
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) updates[k] = v;
  }
  const t = await ContractTemplate.findOneAndUpdate(
    { _id: id, deletedAt: null },
    updates,
    { new: true }
  );
  if (!t) throw new HttpError(404, "Template not found");
  return t;
}

/**
 * Per Review 1.1 §2: import a template from a desktop file (.html or .docx).
 *
 * Per follow-up to Review 1.1 (2026-05-02): when the upload is a .docx we ALSO
 * persist the original file on disk and remember its path on the template doc.
 * Generation later uses the .docx as the source-of-truth so the produced
 * contract mirrors the original Word formatting exactly. The mammoth-derived
 * HTML still populates `body` so the editor and placeholder analyzer keep
 * working unchanged.
 */
export async function createFromUpload(input: {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  name: string;
  description?: string;
  solutionIds?: string[];
  createdBy: string;
}) {
  const ext = input.filename.toLowerCase().split(".").pop();
  let body: string;
  let sourceDocxPath: string | null = null;

  if (ext === "html" || ext === "htm" || input.mimeType === "text/html") {
    body = input.buffer.toString("utf-8");
  } else if (
    ext === "docx" ||
    input.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ buffer: input.buffer });
    body = value;
    // Persist the original .docx so generation can round-trip it.
    const safeBase = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${Date.now()}-${safeBase}`;
    const fullPath = path.join(TEMPLATE_DIR, filename);
    fs.writeFileSync(fullPath, input.buffer);
    sourceDocxPath = `/uploads/templates/${filename}`;
  } else if (ext === "txt" || input.mimeType === "text/plain") {
    // Wrap plain text in a <pre> block so HTML formatting tools have something to manipulate.
    body = `<pre>${input.buffer.toString("utf-8")}</pre>`;
  } else {
    throw new HttpError(
      400,
      `Unsupported file type "${ext ?? input.mimeType}" — accepted: .html, .htm, .docx, .txt`
    );
  }

  return create({
    name: input.name,
    description: input.description,
    body,
    active: true,
    solutionIds: input.solutionIds,
    sourceDocxPath,
    createdBy: input.createdBy,
  });
}

/**
 * Per follow-up to Review 1.1 (2026-05-02): when a template was uploaded as a
 * .docx, generate the contract by substituting `@@placeholder` tokens directly
 * inside the original Word file. Output is a .docx that retains every visual
 * detail from the source — fonts, paragraph styles, tables, headers/footers,
 * embedded images.
 *
 * Implementation uses `pizzip` to read/write the .docx archive and applies
 * substitution in `word/document.xml` plus any header/footer parts. The regex
 * runs against the raw XML; placeholders typed as a single uniform run (the
 * normal case) substitute correctly. If Word split formatting mid-token (e.g.
 * the user italicised half of `@@nome_agente`), the token won't match — re-type
 * the placeholder uniformly to fix.
 *
 * Optional `[[OPTIONAL:id|label]]…[[/OPTIONAL]]` markers are NOT supported in
 * the .docx round-trip path (deleting paragraphs in document.xml safely is
 * complex). Use TipTap-authored templates if you need optional sections.
 */
const DOCX_XML_PARTS = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/header3.xml",
  "word/footer1.xml",
  "word/footer2.xml",
  "word/footer3.xml",
  "word/footnotes.xml",
  "word/endnotes.xml",
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function substituteDocxXml(xml: string, values: Record<string, string>): string {
  return xml.replace(PLACEHOLDER_RE, (_match, tag) => {
    const v = values[tag];
    if (v === undefined || v === null || v === "") return `[[${tag}]]`;
    // Preserve user-entered newlines as Word soft line-breaks.
    const escaped = escapeXml(String(v));
    if (escaped.includes("\n")) {
      return escaped.split("\n").join("</w:t><w:br/><w:t xml:space=\"preserve\">");
    }
    return escaped;
  });
}

export function renderDocx(
  sourceBuffer: Buffer,
  values: Record<string, string>
): Buffer {
  const zip = new PizZip(sourceBuffer);
  for (const part of DOCX_XML_PARTS) {
    const file = zip.file(part);
    if (!file) continue;
    const xml = file.asText();
    const next = substituteDocxXml(xml, values);
    if (next !== xml) zip.file(part, next);
  }
  return zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

export async function readSourceDocx(template: {
  sourceDocxPath?: string | null;
}): Promise<Buffer | null> {
  if (!template.sourceDocxPath) return null;
  // Strip the leading "/uploads/" so we resolve under UPLOAD_ROOT.
  const relativePath = template.sourceDocxPath.replace(/^\/uploads\//, "");
  const fullPath = path.join(UPLOAD_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

export async function softDelete(id: string) {
  const result = await ContractTemplate.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date(), active: false },
    { new: true }
  );
  if (!result) throw new HttpError(404, "Template not found");
}
