"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FaChevronDown, FaDownload, FaFileImage, FaFilePdf } from "react-icons/fa6";
import { useToast } from "@/app/components/ui/Toast";
import { renderOnA4 } from "@/lib/export/a4Page";
import { canvasToPdf } from "@/lib/export/canvasToPdf";
import { downloadBlob } from "@/lib/export/download";

type Format = "png" | "pdf";

// The file is laid out this wide (CSS px), whatever the screen: on the A4 page's 186 mm of printable
// width that makes the 11 px axis labels about 9 pt.
const EXPORT_WIDTH = 620;

/** Resolves after the next paint -- or after 100 ms, which is all a hidden tab gets (no frames there). */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, 100);
  });

const FORMATS: { value: Format; label: string; Icon: typeof FaFileImage }[] = [
  { value: "png", label: "PNG image", Icon: FaFileImage },
  { value: "pdf", label: "PDF document", Icon: FaFilePdf },
];

/** "Download" button with a PNG / PDF menu. The file is made from `children`, rendered off-screen at
 * EXPORT_WIDTH only while it is being made, and saved centred on an A4 portrait page as
 * `<fileName>-<date>.png|pdf`. */
export function ChartDownload({ fileName, children }: { fileName: string; children: ReactNode }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function download(format: Format) {
    setOpen(false);
    setBusy(true);
    try {
      // Two frames: the charts measure their width once mounted, and draw again at it.
      await nextFrame();
      await nextFrame();
      const target = stageRef.current;
      if (!target) throw new Error("Couldn't prepare the chart.");
      const { canvas, widthMm, heightMm } = await renderOnA4(target, { background: getComputedStyle(document.body).backgroundColor });
      const blob =
        format === "pdf"
          ? await canvasToPdf(canvas, widthMm, heightMm)
          : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The picture couldn't be saved.");
      downloadBlob(blob, `${fileName}-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't download the chart.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {busy && (
        <div inert className="pointer-events-none fixed top-0 -left-[10000px]">
          <div ref={stageRef} style={{ width: EXPORT_WIDTH }}>
            {children}
          </div>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-[7px] text-[0.8rem] font-bold text-text-muted hover:text-white disabled:cursor-wait disabled:opacity-60"
      >
        <FaDownload aria-hidden />
        {busy ? "Preparing…" : "Download"}
        <FaChevronDown aria-hidden className="text-[0.65rem]" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1.5 w-44 rounded-xl border border-white/10 bg-bg-main p-1 shadow-lg">
          {FORMATS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitem"
              onClick={() => download(value)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[0.8rem] font-semibold text-text-main hover:bg-white/10"
            >
              <Icon aria-hidden className="text-text-muted" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
