import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { FileWarning, Loader2 } from "lucide-react";

type Props = {
  /** Absolute or relative URL to a .docx file. The browser fetches it as a Blob. */
  src: string;
  className?: string;
  /** Hide the toolbar/scrollbar styling — useful when the parent already wraps. */
  flat?: boolean;
};

/**
 * Per follow-up to Review 1.1 (round 2, 2026-05-02): render the original .docx
 * inline in the browser using docx-preview so admins see exactly what Word
 * shows — fonts, tables, headers/footers, spacing, embedded images. The
 * library parses the .docx zip in the browser and emits styled HTML/CSS into
 * the host container.
 */
export function DocxPreview({ src, className = "", flat = false }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const styleRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function run() {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`Failed to load .docx (${res.status})`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        if (containerRef.current) containerRef.current.innerHTML = "";
        if (styleRef.current) styleRef.current.innerHTML = "";
        await renderAsync(buffer, containerRef.current!, styleRef.current!, {
          className: "docx-rendered",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render .docx");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div
      className={[
        "docx-preview-host relative",
        flat ? "" : "rounded-lg border border-slate-200 bg-slate-100 overflow-auto max-h-[80vh]",
        className,
      ].join(" ")}
    >
      {loading && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="size-4 animate-spin" />
            Loading Word document…
          </div>
        </div>
      )}
      {error && (
        <div className="p-6 flex items-start gap-3 text-sm text-red-700">
          <FileWarning className="size-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Couldn't render the .docx</div>
            <div className="text-xs text-red-600 mt-1">{error}</div>
          </div>
        </div>
      )}
      <div ref={styleRef} className="docx-preview-styles" data-docx-styles />
      <div ref={containerRef} className="docx-preview-content" />
    </div>
  );
}
