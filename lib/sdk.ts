// lib/server-sdk.ts
import axios, { AxiosResponse } from "axios";
import {
  Configuration,
  AuthApi,
  UsersApi,
  BooksApi,
  AppApi,
} from "@satoru-satoshi/summarize-api-sdk";
import type { NextRequest } from "next/server";

export function createServerSdk(req: NextRequest) {
  const ax = axios.create({
    baseURL: process.env.API_URL,
    withCredentials: true,
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") ?? "",
      "user-agent": req.headers.get("user-agent") ?? "",
    },
    validateStatus: () => true,
  });

  // Inject AT from HttpOnly cookie into Authorization for Nest
  ax.interceptors.request.use((cfg) => {
    const at = req.cookies.get("at")?.value;
    if (at) cfg.headers.Authorization = `Bearer ${at}`;
    return cfg;
  });

  ax.interceptors.response.use((resp) => {
    if (resp.status === 401) {
      resp.headers["set-cookie"] = [
        "at=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
        "rt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax",
      ];
    }

    fetch("/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.accessToken) {
          resp.headers["set-cookie"] = [
            `at=${data.accessToken}; Path=/; HttpOnly; SameSite=Lax`,
            `rt=${data.refreshToken}; Path=/; HttpOnly; SameSite=Lax`,
          ];
        }
      })
      .catch((err) => {
        console.error("Error refreshing auth tokens:", err);
      });
    return resp;
  });

  const cfg = new Configuration({
    basePath: process.env.API_URL,
    baseOptions: { withCredentials: true },
  });
  return {
    axios: ax,
    authApi: new AuthApi(cfg, undefined, ax),
    usersApi: new UsersApi(cfg, undefined, ax),
    booksApi: new BooksApi(cfg, undefined, ax),
    appApi: new AppApi(cfg, undefined, ax),
  };
}

// Helper: copy Set-Cookie from Nest → Next response
export function appendSetCookies(from: AxiosResponse, to: Headers) {
  const cookies = from.headers["set-cookie"];

  console.log("Appending Set-Cookie headers:", cookies);
  if (!cookies) return;
  for (const c of Array.isArray(cookies) ? cookies : [cookies])
    to.append("Set-Cookie", c);
}
