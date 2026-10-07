// Draws a piece of the live page onto a canvas, for "download as image / PDF" buttons.
//
// The element is cloned with every computed style written inline (so Tailwind classes and
// `var(--color-...)` colours survive without the page's stylesheets), wrapped in an SVG
// <foreignObject> and rasterised through an <img>. An image can't load the page's fonts, so the
// first font of the element's stack is embedded as data: URLs. Only plain DOM and inline SVG are
// supported (no <img>, <canvas>, <input> or pseudo-elements).
//
// A descendant marked `data-export-only` (and `hidden` on screen) is shown in the picture only, e.g.
// a caption for the file.

const SVG_NS = "http://www.w3.org/2000/svg";

interface Options {
  /** Canvas pixels per CSS pixel. */
  scale?: number;
  /** Space around the element, in CSS pixels. */
  padding?: number;
  /** Painted behind everything; the PNG would otherwise be transparent. */
  background: string;
}

function cloneStyled(source: Element): Element {
  const clone = source.cloneNode(false) as HTMLElement | SVGElement;
  const computed = getComputedStyle(source);
  // An inline `var(...)` is replaced by the resolved value written below.
  clone.removeAttribute("style");
  for (const property of computed) clone.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
  if (source.hasAttribute("data-export-only")) {
    clone.removeAttribute("hidden");
    clone.style.setProperty("display", "block");
  }
  // The computed height leaves out the picture-only parts inside, so it can't stay fixed.
  if (source.querySelector("[data-export-only]")) {
    clone.style.removeProperty("height");
    clone.style.removeProperty("block-size");
  }
  for (const child of source.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) clone.appendChild(child.cloneNode());
    else if (child.nodeType === Node.ELEMENT_NODE) clone.appendChild(cloneStyled(child as Element));
  }
  return clone;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** @font-face rules (files inlined) for the first family of the element's font stack. Empty when
 * there is none or a file can't be read -- the picture then falls back to a system font. */
async function embeddedFontCss(element: Element): Promise<string> {
  const family = getComputedStyle(element).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
  const rules: { rule: CSSFontFaceRule; base: string }[] = [];
  for (const sheet of document.styleSheets) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue; // a cross-origin stylesheet
    }
    for (const rule of cssRules) {
      if (rule instanceof CSSFontFaceRule && rule.style.getPropertyValue("font-family").replace(/^["']|["']$/g, "") === family) {
        rules.push({ rule, base: sheet.href ?? document.baseURI });
      }
    }
  }
  const css = await Promise.all(
    rules.map(async ({ rule, base }) => {
      const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(rule.style.getPropertyValue("src"))?.[1];
      if (!url) return "";
      try {
        const response = await fetch(new URL(url, base));
        if (!response.ok) return "";
        const data = await readAsDataUrl(await response.blob());
        const { style } = rule;
        const unicodeRange = style.getPropertyValue("unicode-range");
        return `@font-face{font-family:"${family}";font-weight:${style.fontWeight || "normal"};font-style:${style.fontStyle || "normal"};${
          unicodeRange ? `unicode-range:${unicodeRange};` : ""
        }src:url("${data}")}`;
      } catch {
        return "";
      }
    })
  );
  return css.join("");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The picture couldn't be drawn."));
    image.src = src;
  });
}

export interface DomCanvas {
  canvas: HTMLCanvasElement;
  /** The picture's size in CSS pixels (the canvas is `scale` times larger). */
  width: number;
  height: number;
}

export async function domToCanvas(element: HTMLElement, { scale = 2, padding = 24, background }: Options): Promise<DomCanvas> {
  const clone = cloneStyled(element) as HTMLElement;
  clone.style.setProperty("margin", "0");
  const innerWidth = Math.ceil(element.getBoundingClientRect().width);
  const width = innerWidth + 2 * padding;

  const box = document.createElement("div");
  box.style.cssText = `box-sizing:border-box;width:${width}px;padding:${padding}px;background:${background}`;
  box.appendChild(clone);

  // The height depends on the optional parts, so it's measured with the picture's own markup, off-screen.
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden";
  stage.appendChild(box);
  document.body.appendChild(stage);
  const height = Math.ceil(box.getBoundingClientRect().height);
  stage.remove();

  const fontCss = await embeddedFontCss(element);
  const svg =
    `<svg xmlns="${SVG_NS}" width="${width}" height="${height}">` +
    `<defs><style>${fontCss}</style></defs>` +
    `<foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(box)}</foreignObject></svg>`;
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't draw the picture.");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, width, height };
}
