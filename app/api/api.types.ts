import z from "zod";
import { AuthApiRegistry } from "./auth/schemas";
import { BooksApiRegistry } from "./books/schemas";

export type Def<
  RQ extends z.ZodTypeAny | undefined,
  RS extends z.ZodTypeAny
> = {
  req: RQ;
  res: RS;
};

export type Registry = {
  GET?: Record<string, Def<undefined, z.ZodTypeAny>>;
  POST?: Record<string, Def<z.ZodTypeAny | undefined, z.ZodTypeAny>>;
  PUT?: Record<string, Def<z.ZodTypeAny | undefined, z.ZodTypeAny>>;
  PATCH?: Record<string, Def<z.ZodTypeAny | undefined, z.ZodTypeAny>>;
  DELETE?: Record<string, Def<z.ZodTypeAny | undefined, z.ZodTypeAny>>;
};

export const ApiRegistry = {
  GET: { ...AuthApiRegistry.GET, ...BooksApiRegistry.GET },
  POST: { ...AuthApiRegistry.POST, ...BooksApiRegistry.POST },
  PUT: {},
  DELETE: {},
} as const;
