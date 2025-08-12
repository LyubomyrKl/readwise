"use client";
import { createContext, useContext, useState } from "react";
import * as api from "@/lib/auth";

type AuthCtx = {
  token?: string;
  login: (e: string, p: string) => Promise<void>;
  logout: () => void;
};
const Ctx = createContext<AuthCtx>({ login: async () => {}, logout: () => {} });

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [token, setToken] = useState<string | undefined>();
  return (
    <Ctx.Provider
      value={{
        token,
        async login(email, password) {
          const res = await api.login({ email, password });
          setToken(res.access_token);
        },
        logout() {
          setToken(undefined);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
export const useAuth = () => useContext(Ctx);
