import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { cookies } from "next/headers";

class AuthenticatedHttpClient {
  private instance: AxiosInstance;

  constructor(baseURL?: string) {
    this.instance = axios.create({
      baseURL: baseURL || process.env.API_URL || "http://localhost:5173",
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.instance.interceptors.request.use(async (config) => {
      try {
        const accessToken = (await cookies()).get("access_token")?.value;
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
      } catch (error) {
        // Server-side only,   on client side
      }
      return config;
    });

    // Global 401 handling with automatic token refresh
    this.instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        console.error("API request failed:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          code: error.code,
        });

        console.error("originalRequest:", originalRequest);

        // Check if we have a 401 error (NestJS UnauthorizedException)
        if (
          (error.response?.data?.statusCode === 401 ||
            error.response?.status === 401) &&
          originalRequest &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;

          try {
            // Extract refresh token from request cookies
            const cookieHeader = originalRequest.headers.Cookie || originalRequest.headers.cookie;
            const refreshToken = cookieHeader
              ?.split(';')
              .find((cookie: string) => cookie.trim().startsWith('refresh_token='))
              ?.split('=')[1];

            if (!refreshToken) {
              this.redirectToLogin();
              return Promise.reject(error);
            }

            const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
            console.warn("Retrying request with refreshed token...");

            const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({ refreshToken: refreshToken }),
            });

            console.warn(refreshResponse);

            if (refreshResponse.ok) {
              const { accessToken, refreshToken: newRefreshToken } =
                await refreshResponse.json();

              // Update the Authorization header for the retry
              if (accessToken && originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              }

              // Update cookies with new tokens (refresh token rotation)
              if (typeof document !== "undefined" && newRefreshToken) {
                // Client-side: update cookies via document
                const isSecure = window.location.protocol === 'https:';
                document.cookie = `access_token=${accessToken}; path=/; ${isSecure ? 'secure;' : ''} samesite=lax; max-age=900`;
                document.cookie = `refresh_token=${newRefreshToken}; path=/; ${isSecure ? 'secure;' : ''} samesite=lax; max-age=604800`;
              }

              // Retry original request with new token
              return this.instance(originalRequest);
            } else {
              // Refresh failed, redirect to login
              this.redirectToLogin();
            }
          } catch (refreshError) {
            console.error("Token refresh failed:", refreshError);
            this.redirectToLogin();
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private redirectToLogin() {
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      window.location.href = `/auth/login?next=${encodeURIComponent(
        currentPath
      )}`;
    }
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get(url, config);
    return response.data;
  }

  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.post(url, data, config);
    return response.data;
  }

  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.instance.put(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete(url, config);
    return response.data;
  }

  getAxiosInstance(): AxiosInstance {
    return this.instance;
  }
}

export const apiAxios = new AuthenticatedHttpClient().getAxiosInstance();
export const httpClient = new AuthenticatedHttpClient();
