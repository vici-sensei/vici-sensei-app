"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";

const VIEWPORT = 320;
const MAX_ZOOM = 3;

interface Offset {
  x: number;
  y: number;
}

interface AvatarCropModalProps {
  file: File;
  outputSize: number;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

export function AvatarCropModal({ file, outputSize, onCancel, onCropped }: AvatarCropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: Offset } | null>(null);

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    // Object URL creation and revocation must stay in the same effect run —
    // Strict Mode's mount/cleanup/remount cycle otherwise revokes a URL a
    // sibling render still depends on, leaving the <img> pointing at a dead blob.
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = useMemo(() => {
    if (!natural) return 1;
    return Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h);
  }, [natural]);

  const scale = baseScale * zoom;

  function clampOffset(next: Offset, currentScale: number, size: { w: number; h: number }): Offset {
    const dispW = size.w * currentScale;
    const dispH = size.h * currentScale;
    const minX = Math.min(0, VIEWPORT - dispW);
    const minY = Math.min(0, VIEWPORT - dispH);
    return {
      x: Math.min(0, Math.max(next.x, minX)),
      y: Math.min(0, Math.max(next.y, minY)),
    };
  }

  function handleImageLoad() {
    const el = imgRef.current;
    if (!el) return;
    const size = { w: el.naturalWidth, h: el.naturalHeight };
    setNatural(size);
    const initialScale = Math.max(VIEWPORT / size.w, VIEWPORT / size.h);
    setOffset({
      x: (VIEWPORT - size.w * initialScale) / 2,
      y: (VIEWPORT - size.h * initialScale) / 2,
    });
  }

  function handleZoomChange(nextZoom: number) {
    if (!natural) {
      setZoom(nextZoom);
      return;
    }
    const nextScale = baseScale * nextZoom;
    const center = VIEWPORT / 2;
    const imgX = (center - offset.x) / scale;
    const imgY = (center - offset.y) / scale;
    const next = { x: center - imgX * nextScale, y: center - imgY * nextScale };
    setZoom(nextZoom);
    setOffset(clampOffset(next, nextScale, natural));
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset };
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !natural) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const next = { x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy };
    setOffset(clampOffset(next, scale, natural));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  async function handleConfirm() {
    if (!natural || !imgRef.current) return;
    setProcessing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const sx = (0 - offset.x) / scale;
      const sy = (0 - offset.y) / scale;
      const sSide = VIEWPORT / scale;
      ctx.drawImage(imgRef.current, sx, sy, sSide, sSide, 0, 0, outputSize, outputSize);

      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, 0.9));
      if (blob) onCropped(blob);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Modal onClose={onCancel} labelledBy="crop-modal-title">
      <h3 id="crop-modal-title" className="mb-1.5 text-lg font-extrabold">
        Adjust your photo
      </h3>
      <p className="mb-5 text-[0.85rem] leading-normal text-text-muted">
        Drag to reposition, and use the slider to zoom.
      </p>

      <div
        className="relative mx-auto h-[320px] w-[320px] touch-none select-none overflow-hidden rounded-2xl border border-white/15 bg-black/40"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {imgUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- object URL drawn to canvas via ref, not a static asset
          <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            draggable={false}
            onLoad={handleImageLoad}
            className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
            style={{
              width: natural ? natural.w * scale : undefined,
              height: natural ? natural.h * scale : undefined,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <span className="text-xs text-text-muted">Zoom</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!natural}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          className="w-full accent-accent-blue"
        />
      </div>

      <div className="mt-7 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={processing}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={!natural || processing}>
          {processing ? "Saving..." : "Save photo"}
        </Button>
      </div>
    </Modal>
  );
}
