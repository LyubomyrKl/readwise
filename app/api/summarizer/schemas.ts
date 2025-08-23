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
  summaryKey: z.string().optional().nullable(),
});

export const GetSummaryReq = z.object({
  bookId: z.string(),
});

export const GetSummaryRes = z.object({
  summary: z.object({
    sections: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        level: z.string(),
        start_char: z.number(),
        end_char: z.number(),
        content: z.string(),
        subsections: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            level: z.string(),
            start_char: z.number(),
            end_char: z.number(),
            content: z.string(),
          })
        ).optional(),
      })
    ),
  }),
  summaryKey: z.string(),
});

export const SummarizerApiRegistry = {
  POST: {
    "/api/summarizer": { req: SummarizeReq, res: SummarizeRes },
    "/api/summarizer/get-summary": { req: GetSummaryReq, res: GetSummaryRes },
  },
} satisfies Registry;
