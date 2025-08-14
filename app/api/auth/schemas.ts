// lib/api/auth/schemas.ts
import { z } from "zod";
import { Registry } from "../api.types";

export const LoginReq = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const User = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string().nullable().optional(),
});

export const registerReqSchema = LoginReq.extend({
  name: z.string().min(1, "Name is required").optional(),
});

export const Tokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const AuthApiRegistry = {
  POST: {
    "/api/auth/login": { req: LoginReq, res: User },
    "/api/auth/register": {
      req: LoginReq.extend({ name: z.string().optional() }),
      res: User,
    },
    "/api/auth/refresh": { req: z.object({}), res: Tokens },
    "/api/auth/logout": { req: z.object({}), res: z.void() },
  },
  GET: {
    "/api/auth/me": { req: undefined, res: User },
  },
} satisfies Registry;
