// lib/http.ts
import axios from "axios";
import { apiFetch } from "./fetcher";

let accessToken: string | null = null;
let refreshing = false;
let waiters: Array<(t: string | null) => void> = [];

const getStoredToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('accessToken');
  }
  return null;
};

const storeToken = (token: string | null) => {
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
  }
};

// Initialize token from storage on load
if (typeof window !== 'undefined') {
  accessToken = getStoredToken();
}

export const setAccessToken = (t: string | null) => {
  accessToken = t;
  storeToken(t);
};
export const clearAccessToken = () => {
  accessToken = null;
  storeToken(null);
};

export const apiAxios = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5173",
  withCredentials: true,
});

apiAxios.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

async function refreshAccess() {
  if (refreshing) return new Promise((res) => waiters.push(res));
  refreshing = true;
  try {
    // Your Next.js refresh route, typed+validated by apiFetch
    const { accessToken: at } = await apiFetch("POST", "/api/auth/refresh", {});
    setAccessToken(at ?? null);
    waiters.forEach((fn) => fn(accessToken));
    return accessToken;
  } finally {
    refreshing = false;
    waiters = [];
  }
}

apiAxios.interceptors.response.use(
  (r) => r,
  async (err) => {
    const cfg = err.config;
    if (err.response?.status !== 401 || cfg.__isRetry) throw err;
    const t = await refreshAccess();
    if (!t) throw err;
    cfg.__isRetry = true;
    cfg.headers.Authorization = `Bearer ${t}`;
    return apiAxios(cfg);
  }
);
