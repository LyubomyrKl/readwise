/**
 * A chapter of an uploaded book is untrusted. The reader renders it in an
 * iframe that may run scripts (iOS Safari only delivers selection events then)
 * and shares the app's origin, so nothing in the book may run: this removes
 * scripts, frames and plug-ins, event handler attributes and script URLs from
 * the parsed chapter before epub.js serializes it into the iframe.
 */

const REMOVED_ELEMENTS = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "portal",
  // SVG animations can set an attribute (an href) to a script URL; old SVG event elements
  "set",
  "animate",
  "animatetransform",
  "animatemotion",
  "handler",
  "listener",
]);

/** Attributes that hold a URL the browser may navigate to or load as a document. */
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "data", "xlink:href", "srcdoc"]);

const SCRIPT_URL = /^(javascript|vbscript|data:text\/html)/i;

export function sanitizeBookDocument(doc: Document): void {
  const all = Array.from(doc.getElementsByTagName("*"));
  for (const el of all) {
    const name = el.localName.toLowerCase();
    if (REMOVED_ELEMENTS.has(name) || (name === "meta" && el.hasAttribute("http-equiv"))) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const attrName = attr.name.toLowerCase();
      const local = attr.localName.toLowerCase();
      if (local.startsWith("on") || attrName === "srcdoc") {
        el.removeAttributeNode(attr);
      } else if ((URL_ATTRIBUTES.has(attrName) || URL_ATTRIBUTES.has(local)) && SCRIPT_URL.test(attr.value.replace(/[\u0000- ]/g, ""))) {
        el.removeAttributeNode(attr);
      }
    }
  }
}
