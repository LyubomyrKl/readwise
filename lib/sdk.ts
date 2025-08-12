import {
  Configuration,
  AuthApi,
  AppApi,
  UsersApi,
} from "@satoru-satoshi/summarize-api-sdk";
import { apiAxios } from "./http";

const cfg = new Configuration({
  basePath: process.env.API_URL || "http://localhost:5173",
  baseOptions: {
    headers: {
      "Content-Type": "application/json",
    },
  },
});
export const authApi = new AuthApi(cfg, undefined, apiAxios);
export const appApi = new AppApi(cfg, undefined, apiAxios);
export const userApi = new UsersApi(cfg, undefined, apiAxios);
