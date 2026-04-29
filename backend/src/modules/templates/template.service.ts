import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ContractTemplate } from "./template.model";
import { HttpError } from "../../middleware/error";

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

const PLACEHOLDER_RE = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
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
  createdBy: string;
}) {
  const exists = await ContractTemplate.findOne({ name: input.name, deletedAt: null });
  if (exists) throw new HttpError(409, "Template with this name already exists");
  return ContractTemplate.create({
    name: input.name,
    description: input.description ?? "",
    body: input.body,
    active: input.active ?? true,
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

export async function softDelete(id: string) {
  const result = await ContractTemplate.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date(), active: false },
    { new: true }
  );
  if (!result) throw new HttpError(404, "Template not found");
}
