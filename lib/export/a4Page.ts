import { domToImage } from "./domToImage";

const A4_SHORT_MM = 210;
const A4_LONG_MM = 297;
const MM_PER_INCH = 25.4;

export interface A4Page {
  canvas: HTMLCanvasElement;
  /** The page's size in millimetres: A4, portrait or landscape. */
  widthMm: number;
  heightMm: number;
}

/**
 * Draws `element` on an A4 page, as large as fits inside the margins and centred, on `background`.
 * Portrait or landscape is whichever lets the picture be larger. The canvas has the page's pixels
 * (`dpi` per inch), so it is also the PNG's size: 1654 x 2339 at 200 dpi.
 */
export async function renderOnA4(element: HTMLElement, { background, marginMm = 12, dpi = 200 }: { background: string; marginMm?: number; dpi?: number }): Promise<A4Page> {
  const { image, width, height } = await domToImage(element);

  /** Millimetres per CSS pixel at which the picture just fits the page's printable area. */
  const fit = (pageWidthMm: number, pageHeightMm: number) => Math.min((pageWidthMm - 2 * marginMm) / width, (pageHeightMm - 2 * marginMm) / height);
  const portrait = fit(A4_SHORT_MM, A4_LONG_MM) >= fit(A4_LONG_MM, A4_SHORT_MM);
  const widthMm = portrait ? A4_SHORT_MM : A4_LONG_MM;
  const heightMm = portrait ? A4_LONG_MM : A4_SHORT_MM;
  const pxPerMm = dpi / MM_PER_INCH;
  const drawScale = fit(widthMm, heightMm) * pxPerMm;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(widthMm * pxPerMm);
  canvas.height = Math.round(heightMm * pxPerMm);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't draw the picture.");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const drawWidth = width * drawScale;
  const drawHeight = height * drawScale;
  context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  return { canvas, widthMm, heightMm };
}
