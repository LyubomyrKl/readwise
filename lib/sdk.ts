// lib/sdk.ts
import {
  Configuration,
  AuthApi,
  UsersApi,
  BooksApi,
  AppApi,
  SummarizerApi,
} from "@satoru-satoshi/summarize-api-sdk";
import axios, { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

// Low-level: creates raw SDK instance (no auto-refresh)
function createRawSdk() {
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

// Token refresh helper
async function refreshAccessToken(): Promise<boolean> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!refreshToken) {
    return false;
  }

  try {
    const response = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${process.env.API_URL}/auth/refresh`,
      { refreshToken },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data?.accessToken) {
      await setTokensToCookies(response.data, cookies());
      return true;
    }
    return false;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      await deleteTokensFromCookies(cookies());
      redirect("/auth/login");
    }
    return false;
  }
}

// Wrapper that handles 401 and token refresh
async function withRefresh<T>(
  apiCall: () => Promise<AxiosResponse<T>>
): Promise<AxiosResponse<T>> {
  try {
    return await apiCall();
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      throw error;
    }

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      throw error;
    }

    // Retry with fresh SDK instance (picks up new token from cookies)
    return await apiCall();
  }
}

// Type helper to wrap all methods of an API class
type WrappedApi<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<AxiosResponse<infer R>>
    ? (...args: A) => Promise<AxiosResponse<R>>
    : T[K];
};

// Wrap an API instance so all methods auto-refresh on 401
function wrapApi<T extends object>(getApi: () => T): WrappedApi<T> {
  return new Proxy({} as WrappedApi<T>, {
    get(_, prop: string) {
      return async (...args: unknown[]) => {
        return withRefresh(() => {
          const api = getApi();
          const method = (api as Record<string, unknown>)[prop];
          if (typeof method === "function") {
            return method.apply(api, args);
          }
          throw new Error(`Method ${prop} not found`);
        });
      };
    },
  });
}

// Main SDK factory - all methods automatically handle token refresh
export function createServerSdk() {
  return {
    booksApi: wrapApi(() => createRawSdk().booksApi),
    authApi: createRawSdk().authApi, // Auth doesn't need refresh wrapper
    usersApi: wrapApi(() => createRawSdk().usersApi),
    appApi: wrapApi(() => createRawSdk().appApi),
    summarizerApi: wrapApi(() => createRawSdk().summarizerApi),
  };
}

// Keep for backwards compatibility / manual use cases
export { withRefresh as withTokenRefresh };

export async function setTokensToCookies(
  tokens: { accessToken: string; refreshToken: string },
  cookiesGetter: ReturnType<typeof cookies>
) {
  const cookieStore = await cookiesGetter;
  cookieStore.set("access_token", tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  cookieStore.set("refresh_token", tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteTokensFromCookies(
  cookiesGetter: ReturnType<typeof cookies>
) {
  const cookieStore = await cookiesGetter;
  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");
}
