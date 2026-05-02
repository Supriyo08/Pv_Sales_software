import { useState } from "react";
import { Printer, Download, FileText } from "lucide-react";
import { Button } from "./ui/Button";

type Props = {
  /** URL of the source file (.docx or .pdf). */
  src: string;
  /** MIME type of the source. Used to label download buttons + decide which actions apply. */
  mimeType: string;
  /** Filename hint (without extension) for downloads. */
  baseFilename?: string;
  /**
   * For .docx: a CSS selector pointing at the rendered docx-preview container.
   * Used by Print + "Download PDF" so we operate on the in-browser rendered
   * view rather than launching Word.
   */
  printableSelector?: string;
};

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Per follow-up to Review 1.1 (round 2, 2026-05-02): every place a generated /
 * source contract appears we offer Print, Download .docx (when applicable),
 * and Download PDF actions.
 *
 * Print: builds a minimal iframe document containing ONLY the styles
 * docx-preview injected (inline <style> tags inside the host) plus the
 * rendered content. We deliberately don't copy Vite's CSS <link> tags because
 * their relative URLs (e.g. /src/index.css) don't resolve inside the iframe.
 *
 * PDF: html2canvas captures the rendered host on the live page (where all
 * styles are already in scope). We temporarily lift overflow/max-height so it
 * sees the full document, not just the visible viewport.
 */
export function DocumentActions({
  src,
  mimeType,
  baseFilename = "contract",
  printableSelector,
}: Props) {
  const isDocx = mimeType === DOCX_MIME || src.toLowerCase().endsWith(".docx");
  const isPdf = mimeType === "application/pdf" || src.toLowerCase().endsWith(".pdf");
  const [pdfBusy, setPdfBusy] = useState(false);

  const print = () => {
    if (printableSelector) {
      const node = document.querySelector(printableSelector) as HTMLElement | null;
      if (node) {
        printDocxPreview(node);
        return;
      }
    }
    // No on-page preview — open the source URL in a new tab.
    if (src) window.open(src, "_blank", "noopener");
  };

  const downloadDocx = () => {
    triggerDownload(src, `${baseFilename}.docx`);
  };

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      if (isPdf) {
        triggerDownload(src, `${baseFilename}.pdf`);
        return;
      }
      const node = printableSelector
        ? (document.querySelector(printableSelector) as HTMLElement | null)
        : null;
      if (!node) {
        window.alert(
          "PDF export needs the document preview to be visible. Open the contract preview first, then click Download PDF."
        );
        return;
      }
      await renderNodeToPdf(node, `${baseFilename}.pdf`);
    } catch (err) {
      window.alert(
        `PDF export failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={print}
        icon={<Printer className="size-4" />}
      >
        Print
      </Button>
      {isDocx && (
        <Button
          size="sm"
          variant="outline"
          onClick={downloadDocx}
          icon={<FileText className="size-4" />}
        >
          Download .docx
        </Button>
      )}
      <Button
        size="sm"
        onClick={downloadPdf}
        loading={pdfBusy}
        icon={<Download className="size-4" />}
      >
        Download PDF
      </Button>
    </div>
  );
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Climb to the .docx-preview-host ancestor, then return:
 *   - styles: concatenated <style> tags injected by docx-preview (live in a
 *     sibling div under the host), serialised with their innerHTML so we
 *     don't depend on iframe URL resolution.
 *   - content: the rendered .docx-preview-content element's outerHTML.
 */
function captureDocxPreview(node: HTMLElement): {
  styles: string;
  content: string;
  host: HTMLElement;
} | null {
  const host = (node.closest(".docx-preview-host") as HTMLElement | null) ?? node;
  const styleEls = host.querySelectorAll("style");
  const styles = Array.from(styleEls)
    .map((s) => `<style>${s.innerHTML}</style>`)
    .join("\n");
  const contentEl =
    host.querySelector(".docx-preview-content") ?? node;
  const content = (contentEl as HTMLElement).outerHTML;
  if (!content || content.trim() === "") return null;
  return { styles, content, host };
}

function buildPrintHtml(captured: { styles: string; content: string }): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<base href="${window.location.origin}/" />
<title>Print preview</title>
<style>
  /* Minimal reset so docx-preview's own styles drive the look. */
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body { font-family: Calibri, "Liberation Sans", Arial, sans-serif; color: #0f172a; }
  table { border-collapse: collapse; }
  img { max-width: none; }
  p { margin: 0; }
  /* Render the Word "pages" cleanly — drop the gray viewer chrome. */
  .docx-preview-content { background: white; display: block; }
  .docx-rendered, .docx-wrapper {
    padding: 0 !important;
    background: white !important;
    display: block !important;
  }
  .docx-rendered section.docx,
  .docx-wrapper section.docx {
    box-shadow: none !important;
    margin: 0 auto !important;
    background: white !important;
    page-break-after: always;
  }
  .docx-rendered section.docx:last-child,
  .docx-wrapper section.docx:last-child { page-break-after: auto; }
  @page { margin: 0; }
  /* Live (non-print) view of the popup — readable while user previews. */
  @media screen {
    body { background: #e5e7eb; padding: 24px; }
    .docx-preview-content { background: transparent; }
  }
</style>
${captured.styles}
</head>
<body>
${captured.content}
<script>
  // Wait for everything (fonts, images) to settle, then auto-trigger print.
  // The popup stays open so the user can re-print or just view.
  (function () {
    function go() {
      try { window.focus(); window.print(); } catch (e) {}
    }
    if (document.readyState === "complete") setTimeout(go, 500);
    else window.addEventListener("load", function () { setTimeout(go, 500); });
  })();
</script>
</body>
</html>`;
}

function printDocxPreview(node: HTMLElement) {
  const captured = captureDocxPreview(node);
  if (!captured) {
    window.alert(
      "Nothing to print yet — generate the preview first, then click Print."
    );
    return;
  }
  const fullHtml = buildPrintHtml(captured);

  // Open a real popup window — gives us a real viewport (no zero-size iframe
  // clipping), bypasses Brave's strict iframe sandboxing in dev, and lets the
  // user visually verify the rendered Word doc before printing.
  const win = window.open("", "_blank", "width=900,height=1100,scrollbars=yes");
  if (!win) {
    window.alert(
      "Your browser blocked the print window. Allow popups for this site, then click Print again."
    );
    return;
  }
  win.document.open();
  win.document.write(fullHtml);
  win.document.close();

  // The popup auto-prints once docx-preview's content settles.
  // The script tag inside `fullHtml` handles the timing (see buildPrintHtml).
}

/**
 * Capture the .docx-preview-host on the live page as a PDF using html2pdf.js.
 * Temporarily lifts overflow + max-height so html2canvas sees the full
 * rendered Word document, not just the visible viewport.
 */
async function renderNodeToPdf(node: HTMLElement, filename: string) {
  const host = (node.closest(".docx-preview-host") as HTMLElement | null) ?? node;

  const previous = {
    overflow: host.style.overflow,
    maxHeight: host.style.maxHeight,
    height: host.style.height,
    background: host.style.background,
  };
  host.style.overflow = "visible";
  host.style.maxHeight = "none";
  host.style.height = "auto";
  host.style.background = "white";

  try {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const html2pdf = (await import("html2pdf.js")).default;
    const opts: Record<string, unknown> = {
      margin: [10, 10, 10, 10],
      filename,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    };
    await html2pdf().set(opts as never).from(host).save();
  } finally {
    host.style.overflow = previous.overflow;
    host.style.maxHeight = previous.maxHeight;
    host.style.height = previous.height;
    host.style.background = previous.background;
  }
}
