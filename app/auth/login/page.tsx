// app/login/page.tsx
"use client";
import { useState } from "react";

export default function Login() {
  const [email, setE] = useState("");
  const [password, setP] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await fetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        if (r.ok) location.assign("/dashboard");
      }}
      className="space-y-3"
    >
      <input
        value={email}
        onChange={(e) => setE(e.target.value)}
        placeholder="email"
      />
      <input
        value={password}
        onChange={(e) => setP(e.target.value)}
        type="password"
        placeholder="password"
      />
      <button type="submit">Sign in</button>
    </form>
  );
}
