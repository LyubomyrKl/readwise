"use client";
import { pdfjs } from 'react-pdf';

// Polyfill DOMMatrix for server-side rendering
if (typeof globalThis !== 'undefined' && typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-ignore - Polyfill for SSR
  globalThis.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor() {}
    static fromMatrix() { return new this(); }
    static fromFloat32Array() { return new this(); }
    static fromFloat64Array() { return new this(); }
    translate() { return this; }
    scale() { return this; }
    rotate() { return this; }
    multiply() { return this; }
    inverse() { return this; }
  };
}

export function setupPdfjsWorker() {
  if (typeof window === "undefined") return;
  if (pdfjs.GlobalWorkerOptions.workerSrc) {
    console.log('PDF.js worker already configured:', pdfjs.GlobalWorkerOptions.workerSrc);
    return; // idempotent
  }
  
  // Configure for react-pdf - use the worker from CDN for better compatibility
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`;
  console.log('PDF.js worker configured:', pdfjs.GlobalWorkerOptions.workerSrc);
}

export { pdfjs };
