import { getClient } from "../client";
import type {
  LoginDto,
  RegisterDto,
  RefreshDto,
  AuthBundle,
  Tokens,
} from "@/lib/types";

export const authApi = {
  async login(dto: LoginDto) {
    const client = getClient();
    return client.post<AuthBundle>("/auth/login", dto);
  },

  async register(dto: RegisterDto) {
    const client = getClient();
    return client.post<AuthBundle>("/auth/register", dto);
  },

  async refresh(dto: RefreshDto) {
    const client = getClient();
    return client.post<Tokens>("/auth/refresh", dto);
  },

  async logout() {
    const client = getClient();
    return client.post("/auth/logout");
  },
};
