"use client";

import { useState } from "react";
import {
  Settings,
  Eye,
  EyeOff,
  Type,
  Palette,
  BookOpen,
  FileText,
} from "lucide-react";

interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  backgroundColor: string;
  textColor: string;
  lineHeight: number;
  margin: number;
  theme: "light" | "dark" | "sepia";
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen w-full relative bg-background overflow-hidden">
      {children}
    </div>
  );
}
