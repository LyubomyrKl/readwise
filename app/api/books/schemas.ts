import { z } from "zod";
import { Registry } from "../api.types";

export const PresignReq = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  description: z.string().min(1),
  filename: z.string().min(1),
  mime: z.string().min(1),
  sizeBytes: z.number().positive(),
  customCoverFilename: z.string().optional(),
  customCoverMime: z.string().optional(),
  customCoverSizeBytes: z.number().positive().optional(),
});

export const PresignRes = z.object({
  bookId: z.string(),
  storageKey: z.string(),
  upload: z.object({
    url: z.url(),
    headers: z.record(z.string(), z.string()),
  }),
  coverStorageKey: z.string().optional(),
  coverUpload: z
    .object({
      url: z.url(),
      headers: z.record(z.string(), z.string()),
    })
    .optional(),
});

export const FinalizeReq = z.object({
  bookId: z.string(),
});

export const FinalizeRes = z.object({
  bookId: z.string(),
  status: z.literal("ready").or(z.literal("pending")).or(z.literal("failed")),
});

export const FinalizeCoverReq = z.object({
  bookId: z.string(),
});

export const FinalizeCoverRes = z.object({
  bookId: z.string(),
  status: z.literal("ready").or(z.literal("pending")).or(z.literal("failed")),
});

export const BookResponse = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  coverUrl: z.string().optional(),
  fileUrl: z.string(),
  spentHours: z.number(),
  pageCount: z.number().nullable(),
  pagePassCount: z.number(),
  isFinished: z.boolean(),
  isFavorite: z.boolean(),
  mime: z.string(),
  sizeBytes: z.string(),
  status: z.string(),
  lastAccessed: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  notes: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      bookId: z.string(),
      body: z.string(),
      anchor: z.any().nullable(),
      isPinned: z.boolean(),
      isArchived: z.boolean(),
    })
  ),
  highlights: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      bookId: z.string(),
      color: z.string().nullable(),
      text: z.string(),
      anchor: z.any(),
      noteId: z.string().nullable(),
    })
  ),
  tags: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string().nullable(),
      description: z.string().nullable(),
    })
  ),
});

export const GetAllBooksRes = z.array(BookResponse);

export const BooksApiRegistry = {
  POST: {
    "/api/books/createBookAndPresign": { req: PresignReq, res: PresignRes },
    "/api/books/finalize": { req: FinalizeReq, res: FinalizeRes },
    "/api/books/finalizeCover": {
      req: FinalizeCoverReq,
      res: FinalizeCoverRes,
    },
  },
  GET: {
    "/api/books": { req: undefined, res: GetAllBooksRes },
    "/api/books/[id]": { req: undefined, res: BookResponse },
    "/api/books/[id]/download": { req: undefined, res: z.any() },
  },
} satisfies Registry;
