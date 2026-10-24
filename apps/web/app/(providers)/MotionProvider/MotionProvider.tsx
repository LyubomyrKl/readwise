// ((components))/motion-provider.tsx
"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Mode = "system" | "on" | "off";
type Ctx = { enabled: boolean; mode: Mode; setMode: (m: Mode) => void };

const MotionCtx = createContext<Ctx | null>(null);
const KEY = "motion-mode";
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("system");
  const [sysReduced, setSysReduced] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as Mode | null;
    if (stored) setMode(stored);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setSysReduced(mq.matches);
    f();
    mq.addEventListener?.("change", f);
    return () => mq.removeEventListener?.("change", f);
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, mode);
  }, [mode]);

  const enabled = useMemo(() => {
    if (mode === "on") return true;
    if (mode === "off") return false;
    return !sysReduced;
  }, [mode, sysReduced]);

  return (
    <MotionCtx.Provider value={{ enabled, mode, setMode }}>
      {children}
    </MotionCtx.Provider>
  );
}

export function useMotion() {
  const v = useContext(MotionCtx);
  if (!v) throw new Error("useMotion must be used within MotionProvider");
  return v;
}
