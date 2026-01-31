import axios, { AxiosInstance, AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Tokens } from "@/lib/types";

const API_URL = process.env.API_URL || "https://summarizer-gateway.vercel.app";

// Create axios instance
function createAxiosInstance(): AxiosInstance {
  const instance = axios.create({
    baseURL: API_URL,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // Request interceptor to add auth token
  instance.interceptors.request.use(async (config) => {
    // Skip auth for auth endpoints
    if (
      config.url?.includes("/auth/login") ||
      config.url?.includes("/auth/refresh") ||
      config.url?.includes("/auth/register")
    ) {
      return config;
    }

    const token = (await cookies()).get("access_token")?.value;
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    return config;
  });

  return instance;
}

// Token refresh helper
async function refreshAccessToken(): Promise<boolean> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!refreshToken) {
    return false;
  }

  try {
    const response = await axios.post<Tokens>(
      `${API_URL}/auth/refresh`,
      { refreshToken },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data?.accessToken) {
      await setTokensToCookies(response.data);
      return true;
    }
    return false;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      await deleteTokensFromCookies();
      redirect("/auth/login");
    }
    return false;
  }
}

// Wrapper that handles 401 and token refresh
export async function withRefresh<T>(
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

    // Retry with fresh token (new instance picks up new token from cookies)
    return await apiCall();
  }
}

// Cookie management
export async function setTokensToCookies(tokens: Tokens): Promise<void> {
  const cookieStore = await cookies();
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

export async function deleteTokensFromCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");
}

// Export the axios instance getter
export function getClient(): AxiosInstance {
  return createAxiosInstance();
}

// Re-export axios for error checking
export { axios };
