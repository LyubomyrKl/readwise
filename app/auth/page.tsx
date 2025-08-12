"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../providers/AuthProvider/AuthProvider";
import { Configuration, AppApi } from "@satoru-satoshi/summarize-api-sdk";

export default function AuthPage() {
  const { login, token, logout } = useAuth();
  const [ping, setPing] = useState<"idle" | "ok" | "fail">("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // stub: check SDK wiring via Next API proxy
  useEffect(() => {
    let cancelled = false;

    const runCheck = async () => {
      try {
        // Configure SDK (use your actual API base URL)
        const config = new Configuration({
          basePath: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
        });

        const api = new AppApi(config);

        // Example: if your API has a "health" endpoint
        await api.getHello(); // Adjust to match generated method name

        if (!cancelled) setPing("ok");
      } catch (err) {
        console.error("SDK test failed", err);
        if (!cancelled) setPing("fail");
      }
    };

    runCheck();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Sign in</h1>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        API check: {ping === "idle" ? "…" : ping === "ok" ? "ok" : "fail"}
      </div>

      {token ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div>Logged in</div>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await login(email, password);
          }}
          style={{ display: "grid", gap: 8 }}
        >
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Sign in</button>
        </form>
      )}
    </div>
  );
}
