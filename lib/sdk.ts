import {
  Configuration,
  AuthApi,
  AppApi,
  UsersApi,
} from "@satoru-satoshi/summarize-api-sdk";

const cfg = new Configuration({ basePath: process.env.API_URL });
export const authApi = new AuthApi(cfg);
export const appApi = new AppApi(cfg);
export const userApi = new UsersApi(cfg);
