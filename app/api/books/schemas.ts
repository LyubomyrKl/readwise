import { z } from "zod";
import { Registry } from "../api.types";
import { de } from "zod/v4/locales";

export const PresignReq = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  author: z.string().min(1),
  filename: z.string().min(1),
  mime: z.string().min(1),
  sizeBytes: z.number().positive(),
  sha256: z.string().min(1),
});

export const PresignRes = z.object({
  bookId: z.string(),
  storageKey: z.string(),
  upload: z.object({
    url: z.url(),
    headers: z.record(z.string(), z.string()),
  }),
});

export const FinalizeReq = z.object({
  bookId: z.string(),
});

export const FinalizeRes = z.object({
  bookId: z.string(),
  status: z.literal("ready"),
});

export const Book = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number(),
  sha256: z.string(),
  storageKey: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BooksApiRegistry = {
  POST: {
    "/api/books/presign": { req: PresignReq, res: PresignRes },
    "/api/books/finalize": { req: FinalizeReq, res: FinalizeRes },
  },
  GET: {
    "/api/books/[id]": { req: undefined, res: Book },
    "/api/books/[id]/download": { req: undefined, res: z.any() },
  },
} as const satisfies Registry;
