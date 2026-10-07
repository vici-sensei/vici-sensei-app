// A one-page PDF holding a canvas as an image, written by hand so the app doesn't need a PDF library.
// The image covers the whole page; its pixels stay at the canvas's own resolution.

const PT_PER_MM = 72 / 25.4;

interface PdfImage {
  /** PDF filter name for `bytes`. */
  filter: "FlateDecode" | "DCTDecode";
  bytes: Uint8Array;
}

/** Lossless: the canvas's RGB pixels, deflated. Needs CompressionStream (every current browser). */
async function flateImage(canvas: HTMLCanvasElement): Promise<PdfImage> {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't read the picture.");
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  const stream = new Blob([rgb]).stream().pipeThrough(new CompressionStream("deflate"));
  return { filter: "FlateDecode", bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

/** Fallback for browsers without CompressionStream: a PDF can hold a JPEG as it is. */
async function jpegImage(canvas: HTMLCanvasElement): Promise<PdfImage> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new Error("This browser can't encode the picture.");
  return { filter: "DCTDecode", bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export async function canvasToPdf(canvas: HTMLCanvasElement, pageWidthMm: number, pageHeightMm: number): Promise<Blob> {
  const image = typeof CompressionStream === "undefined" ? await jpegImage(canvas) : await flateImage(canvas);
  const pageWidth = (pageWidthMm * PT_PER_MM).toFixed(2);
  const pageHeight = (pageHeightMm * PT_PER_MM).toFixed(2);
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;

  const encoder = new TextEncoder();
  const objects: (string | Uint8Array)[][] = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`],
    [
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter} /Length ${image.bytes.length} >>\nstream\n`,
      image.bytes,
      "\nendstream",
    ],
    [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
  ];

  const parts: (string | Uint8Array)[] = ["%PDF-1.4\n"];
  let offset = parts[0].length;
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(offset);
    for (const piece of [`${i + 1} 0 obj\n`, ...object, "\nendobj\n"]) {
      parts.push(piece);
      offset += typeof piece === "string" ? encoder.encode(piece).length : piece.length;
    }
  });
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  parts.push(xref);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}
