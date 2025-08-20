// lib/server-sdk.ts
import {
  Configuration,
  AuthApi,
  UsersApi,
  BooksApi,
  AppApi,
  SummarizerApi,
} from "@satoru-satoshi/summarize-api-sdk";
import axios from "axios";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export function createServerSdk() {
  const ax = axios.create({
    baseURL: process.env.API_URL,
  });

  ax.interceptors.request.use(async (config) => {
    if (
      config.url?.includes("/login") ||
      config.url?.includes("/refresh") ||
      config.url?.includes("/register")
    ) {
      return config;
    }

    const token = (await cookies()).get("access_token")?.value;

    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    return config;
  });

  ax.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (!error.response) {
        console.error("Network error:", error);
        return Promise.reject(error);
      }

      if (error.config._retry) {
        console.warn("Request already retried, not retrying again.");
        return Promise.reject(error);
      }

      const refreshToken = (await cookies()).get("refresh_token")?.value;

      console.warn(
        error.response?.status,
        "error.response?.status:",
        error.response?.status
      );

      if (error.response?.status === 401 && refreshToken) {
        const authApi = new AuthApi(
          new Configuration({ basePath: process.env.API_URL })
        );

        const response = await authApi
          .refresh({
            refreshDto: {
              refreshToken,
            },
          })
          .then((res) => {
            return res;
          })
          .catch((err) => {
            if (err.response?.status === 401) {
              deleteTokensFromCookies(cookies());
              redirect("/auth/login");
            } else {
              console.error("Error refreshing token:", err);
            }

            return Promise.reject(err);
          });

        if (response.data) {
          console.log("Token refreshed successfully:", response.data);
          await setTokensToCookies(response.data, cookies());

          console.log((await cookies()).get("access_token"));
          console.log((await cookies()).get("refresh_token"));

          const originalRequest = error.config;
          originalRequest.headers[
            "Authorization"
          ] = `Bearer ${response.data.accessToken}`; // Update the Authorization header with the new token
          originalRequest._retry = true; // Mark the request as retried

          return axios(originalRequest);
        }
      }
      return Promise.reject(error);
    }
  );

  const cfg = new Configuration({
    basePath: process.env.API_URL,
    baseOptions: { withCredentials: true },
  });
  return {
    summarizerApi: new SummarizerApi(cfg, undefined, ax),
    authApi: new AuthApi(cfg, undefined, ax),
    usersApi: new UsersApi(cfg, undefined, ax),
    booksApi: new BooksApi(cfg, undefined, ax),
    appApi: new AppApi(cfg, undefined, ax),
  };
}

export async function setTokensToCookies(
  resp: { accessToken: string; refreshToken: string },
  cookies: ReturnType<typeof import("next/headers").cookies>
) {
  (await cookies).set("access_token", resp.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  (await cookies).set("refresh_token", resp.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function deleteTokensFromCookies(
  cookies: ReturnType<typeof import("next/headers").cookies>
) {
  (await cookies).delete("access_token");
  (await cookies).delete("refresh_token");
}
