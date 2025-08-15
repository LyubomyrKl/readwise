"use client";
import * as pdfjs from "pdfjs-dist";
import { GlobalWorkerOptions } from "pdfjs-dist";

export function setupPdfjsWorker() {
  if (typeof window === "undefined") return;
  if ((GlobalWorkerOptions as any).workerPort) return; // idempotent
  GlobalWorkerOptions.workerPort = new Worker("/pdf.worker.mjs", {
    type: "module",
  });
}

export { pdfjs };
