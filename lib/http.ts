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

        console.log("Access token:", accessToken);

        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
      } catch {
        // Server-side only, ignore on client side
      }
      return config;
    });

    // Global 401 handling with automatic token refresh
    this.instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Check if we have a 401 error (NestJS UnauthorizedException)
        if (
          (error.response?.data?.statusCode === 401 ||
            error.response?.status === 401) &&
          originalRequest &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;

          try {
            // Get refresh token from cookies
            const refreshToken = (await cookies()).get("refresh_token")?.value;

            if (!refreshToken) {
              this.redirectToLogin();
              return Promise.reject(error);
            }

            const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

            const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({ refreshToken: refreshToken }),
            });

            if (refreshResponse.ok) {
              const responseData = await refreshResponse.json();
              const { accessToken, refreshToken: newRefreshToken } = responseData;

              console.log("Refresh response data:", responseData);
              console.log("New access token:", accessToken);
              console.log("New refresh token:", newRefreshToken);

              // Verify tokens are not undefined
              if (!accessToken) {
                console.error("Access token is undefined in refresh response");
                this.redirectToLogin();
                return Promise.reject(error);
              }

              // Update the Authorization header for the retry
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              }

              // The refresh route already sets httpOnly cookies via Set-Cookie headers
              // No need to manually set cookies on client-side since they're httpOnly
              // The browser will automatically handle the Set-Cookie headers from the refresh response

              // Retry original request with new token
              return this.instance(originalRequest);
            } else {
              // Refresh failed, redirect to login
              this.redirectToLogin();
            }
          } catch {
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
