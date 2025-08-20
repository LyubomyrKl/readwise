import { z } from "zod";
import { Registry } from "../api.types";

export const SummarizeReq = z.object({
  bookId: z.string(),
});

export const SummarizeRes = z.object({
  bookId: z.string(),
  userId: z.string(),
  message: z.string(),
  success: z.boolean(),
});

export const SummarizerApiRegistry = {
  POST: {
    "/api/summarizer": { req: SummarizeReq, res: SummarizeRes },
  },
} satisfies Registry;
