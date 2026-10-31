/**
 * The Content-Security-Policy of the book reader (docs/document-architecture.md, Security).
 *
 * Book chapters are untrusted documents rendered in same-origin frames that must be allowed to run
 * scripts (WebKit bug 218086: without allow-scripts, Safari does not deliver the reader's own
 * listeners into the frame). Documents loaded from blob: URLs inherit this policy, so its script
 * rules are what keeps a book's scripts and inline handlers from running: only scripts carrying
 * this response's nonce run, and what they load ('strict-dynamic'). PDF.js needs
 * 'wasm-unsafe-eval' for its image decoders; books need inline styles and blob: resources.
 * frame-ancestors 'self' (instead of the 'none' Caddy adds elsewhere) lets the page frame its own
 * chapters: Safari applies the inherited frame-ancestors to them and refused to show them.
 */

export const READER_PAGE = /^\/apps\/reader\/book\/[^/]+\/read\/?$/;

export function readerCsp(nonce: string, dev = false): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'", "blob:"],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'", "blob:", "data:"],
    "media-src": ["'self'", "blob:", "data:"],
    "connect-src": ["'self'", ...(dev ? ["ws:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** A fresh nonce per response (base64 of 16 random bytes). */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
