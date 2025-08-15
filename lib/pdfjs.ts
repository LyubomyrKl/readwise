"use client";
import { pdfjs } from 'react-pdf';

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
