// lib/api/auth/schemas.ts
import { z } from "zod";
import { Registry } from "../api.types";

export const LoginReq = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const User = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
});

export const Tokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const AuthBundle = z.object({ user: User, tokens: Tokens });

export const AuthApiRegistry = {
  POST: {
    "/api/auth/login": { req: LoginReq, res: AuthBundle },
    "/api/auth/register": {
      req: LoginReq.extend({ name: z.string().optional() }),
      res: AuthBundle,
    },
    "/api/auth/refresh": { req: z.object({}), res: Tokens },
    "/api/auth/logout": { req: z.object({}), res: z.void() },
  },
  GET: {
    "/api/auth/me": { req: undefined, res: User },
  },
} as const satisfies Registry;
