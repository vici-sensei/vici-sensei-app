import { domToImage } from "./domToImage";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MM_PER_INCH = 25.4;

export interface A4Page {
  canvas: HTMLCanvasElement;
  /** The page's size in millimetres: A4 portrait. */
  widthMm: number;
  heightMm: number;
}

/**
 * Draws `element` on an A4 portrait page, as large as fits inside the margins and centred, on
 * `background`. The canvas has the page's pixels (`dpi` per inch), so it is also the PNG's size:
 * 1654 x 2339 at 200 dpi.
 */
export async function renderOnA4(element: HTMLElement, { background, marginMm = 12, dpi = 200 }: { background: string; marginMm?: number; dpi?: number }): Promise<A4Page> {
  const { image, width, height } = await domToImage(element);

  const pxPerMm = dpi / MM_PER_INCH;
  // Pixels of the page per CSS pixel of the picture, at which it just fits the printable area.
  const drawScale = Math.min((A4_WIDTH_MM - 2 * marginMm) / width, (A4_HEIGHT_MM - 2 * marginMm) / height) * pxPerMm;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(A4_WIDTH_MM * pxPerMm);
  canvas.height = Math.round(A4_HEIGHT_MM * pxPerMm);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't draw the picture.");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const drawWidth = width * drawScale;
  const drawHeight = height * drawScale;
  context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  return { canvas, widthMm: A4_WIDTH_MM, heightMm: A4_HEIGHT_MM };
}
