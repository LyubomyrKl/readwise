/**
 * Highlight geometry for PDF pages: screen rectangles of a selection become quads in PDF user
 * space (points, origin at the bottom left of the unrotated page), the form PDF highlight
 * annotations, PDF.js's own highlight editor and Zotero store; they do not change with zoom or
 * re-rendering. A quad is 8 numbers: upper left, upper right, lower left, lower right.
 */

type Viewport = { convertToPdfPoint(x: number, y: number): number[] };
type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** One client rect (viewport pixels) as a quad, relative to the page's text layer origin. */
export function rectToQuad(viewport: Viewport, rect: Box, origin: { left: number; top: number }): number[] {
  const [x1, y1] = viewport.convertToPdfPoint(rect.left - origin.left, rect.top - origin.top);
  const [x2, y2] = viewport.convertToPdfPoint(rect.right - origin.left, rect.bottom - origin.top);
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.max(y1, y2);
  const bottom = Math.min(y1, y2);
  return [left, top, right, top, left, bottom, right, bottom].map((n) => Math.round(n * 100) / 100);
}

/** The bounding box of quads in PDF space: top is the largest y. */
export function quadBounds(quads: number[][]): { left: number; top: number; right: number; bottom: number } {
  let left = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  let bottom = Infinity;
  for (const q of quads) {
    for (let i = 0; i < 8; i += 2) {
      left = Math.min(left, q[i]);
      right = Math.max(right, q[i]);
      top = Math.max(top, q[i + 1]);
      bottom = Math.min(bottom, q[i + 1]);
    }
  }
  return { left, top, right, bottom };
}

/**
 * Client rects of a selection, without the empty ones, merged per line: a text layer gives one
 * rect per span, often several per line and some nested.
 */
export function mergeLineRects(rects: Box[]): Box[] {
  const sorted = rects
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const out: Box[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    const sameLine = last && Math.abs(last.top - r.top) < Math.min(last.height, r.height) * 0.5;
    if (sameLine && r.left <= last.right + Math.max(4, r.height * 0.6)) {
      const left = Math.min(last.left, r.left);
      const right = Math.max(last.right, r.right);
      const top = Math.min(last.top, r.top);
      const bottom = Math.max(last.bottom, r.bottom);
      out[out.length - 1] = { left, right, top, bottom, width: right - left, height: bottom - top };
    } else {
      out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
    }
  }
  return out;
}
