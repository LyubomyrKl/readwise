import { buildQuote, findQuote, normalizeWithMap, rawToNormalized, toCodePointIndex, type Quote } from "../locator";

/**
 * The visible text of a DOM subtree as one string, with the text nodes it came from: lets a DOM
 * Range become offsets in normalized text (for quotes and positions) and offsets become a Range
 * again (to draw a highlight found by its quote). Both engines use it: PDF.js text layers and
 * foliate chapter documents.
 */
export type TextIndex = {
  raw: string;
  text: string;
  toRaw: number[];
  nodes: { node: Text; start: number }[];
};

/** Elements whose text is not read (compared by localName: XHTML chapters keep lower case). */
const SKIP = new Set(["script", "style", "noscript", "template", "head", "title"]);
/** Elements that start a new line of text: a virtual space goes between their text and what came before. */
const BLOCKS = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption", "figure", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

/**
 * Text nodes in document order, joined; a virtual space (in `raw` only, owned by no node) where a
 * block element or a line break separates two runs of text, so words of adjacent paragraphs or
 * PDF lines do not run together.
 */
export function indexText(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) =>
      node.nodeType === Node.ELEMENT_NODE && SKIP.has((node as Element).localName.toLowerCase())
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: { node: Text; start: number }[] = [];
  let raw = "";
  let previousBlock: Node | null = null;
  let lineBreak = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const name = (n as Element).localName.toLowerCase();
      if (name === "br" || name === "hr") lineBreak = true;
      continue;
    }
    const text = n as Text;
    const block = nearestBlock(text, root);
    if (previousBlock && (block !== previousBlock || lineBreak) && raw.length > 0 && !/\s$/.test(raw)) raw += " ";
    previousBlock = block;
    lineBreak = false;
    nodes.push({ node: text, start: raw.length });
    raw += text.data;
  }
  const { text, toRaw } = normalizeWithMap(raw);
  return { raw, text, toRaw, nodes };
}

function nearestBlock(node: Node, root: Node): Node {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (BLOCKS.has(el.localName.toLowerCase())) return el;
  }
  return root;
}

/** The raw offset of a DOM boundary point inside the index, or -1 when it is outside. */
export function rawOffset(index: TextIndex, container: Node, offset: number): number {
  if (container.nodeType === Node.TEXT_NODE) {
    const entry = index.nodes.find((e) => e.node === container);
    return entry ? entry.start + offset : -1;
  }
  // an element boundary: the text that starts at or after the child at `offset`
  const child = container.childNodes[offset] ?? null;
  const probe: Node | null = child;
  if (!probe) {
    // after the last child: the end of the last text node inside the container
    let last = -1;
    for (const e of index.nodes) if (container.contains(e.node)) last = e.start + e.node.data.length;
    return last;
  }
  for (const e of index.nodes) {
    if (probe === e.node || probe.contains(e.node) || (probe.compareDocumentPosition(e.node) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      return e.start;
    }
  }
  return index.raw.length;
}

/** A Range's place in the index: normalized UTF-16 offsets, or null when it is not inside. */
export function rangeToOffsets(index: TextIndex, range: Range): { start: number; end: number } | null {
  const rawStart = rawOffset(index, range.startContainer, range.startOffset);
  const rawEnd = rawOffset(index, range.endContainer, range.endOffset);
  if (rawStart < 0 || rawEnd < 0 || rawEnd < rawStart) return null;
  return { start: rawToNormalized(index.toRaw, rawStart), end: rawToNormalized(index.toRaw, rawEnd) };
}

/** Normalized offsets back to a DOM Range over the indexed nodes. */
export function offsetsToRange(index: TextIndex, start: number, end: number): Range | null {
  if (index.nodes.length === 0) return null;
  const rawStart = index.toRaw[Math.max(0, Math.min(start, index.toRaw.length - 1))];
  const rawEnd = index.toRaw[Math.max(0, Math.min(end, index.toRaw.length - 1))];
  const a = locate(index, rawStart, false);
  const b = locate(index, rawEnd, true);
  if (!a || !b) return null;
  const range = a.node.ownerDocument.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

function locate(index: TextIndex, raw: number, isEnd: boolean): { node: Text; offset: number } | null {
  for (let i = 0; i < index.nodes.length; i += 1) {
    const { node, start } = index.nodes[i];
    const end = start + node.data.length;
    if (raw < end || (isEnd && raw === end) || i === index.nodes.length - 1) {
      return { node, offset: Math.max(0, Math.min(node.data.length, raw - start)) };
    }
  }
  return null;
}

/**
 * The quote and code-point position of a selection in the index (normalized text), or null when
 * the selection holds no text.
 */
export function describeRange(index: TextIndex, range: Range): { quote: Quote; position: { start: number; end: number }; progression: number } | null {
  const offsets = rangeToOffsets(index, range);
  if (!offsets) return null;
  const { quote, start, end } = buildQuote(index.text, offsets.start, offsets.end);
  if (!quote.exact) return null;
  return {
    quote,
    position: { start: toCodePointIndex(index.text, start), end: toCodePointIndex(index.text, end) },
    progression: index.text.length ? start / index.text.length : 0,
  };
}

/** A stored quote found in the index as a Range (with the match score), or null. */
export function quoteToRange(index: TextIndex, quote: Quote, hintCodePoints?: number): { range: Range; score: number } | null {
  const hint = hintCodePoints === undefined ? undefined : utf16FromCodePoints(index.text, hintCodePoints);
  const match = findQuote(index.text, quote, hint);
  if (!match) return null;
  const range = offsetsToRange(index, match.start, match.end);
  return range ? { range, score: match.score } : null;
}

function utf16FromCodePoints(text: string, cp: number): number {
  let count = 0;
  let i = 0;
  while (i < text.length && count < cp) {
    const c = text.charCodeAt(i);
    i += c >= 0xd800 && c <= 0xdbff ? 2 : 1;
    count += 1;
  }
  return i;
}
