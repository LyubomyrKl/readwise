import z from "zod";

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
