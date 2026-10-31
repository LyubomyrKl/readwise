"use client";

import { Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReaderPreferences, ReaderTheme } from "../engines/types";
import type { BookFormat } from "../locator";

type Props = {
  format: BookFormat;
  preferences: ReaderPreferences;
  onChange: (patch: Partial<ReaderPreferences>) => void;
  onClose: () => void;
};

const THEMES: { value: ReaderTheme; label: string; swatch: string }[] = [
  { value: "light", label: "Light", swatch: "#ffffff" },
  { value: "sepia", label: "Sepia", swatch: "#f4ecd8" },
  { value: "dark", label: "Dark", swatch: "#1e1e1e" },
];

const ZOOMS: { value: ReaderPreferences["zoom"]; label: string }[] = [
  { value: "page-width", label: "Fit width" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100%" },
  { value: 1.25, label: "125%" },
  { value: 1.5, label: "150%" },
  { value: 2, label: "200%" },
];

function Choice<T>({ value, current, onPick, children }: { value: T; current: T; onPick: (v: T) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      aria-pressed={value === current}
      className={`rounded-md border px-3 py-1.5 text-sm ${value === current ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}

/** Reading preferences: theme for every book; type and flow for reflowable books; zoom for PDFs. */
export default function SettingsPanel({ format, preferences, onChange, onClose }: Props) {
  return (
    <aside className="reader-panel right-0" aria-label="Reading settings">
      <header className="reader-panel-header">
        <h2 className="flex items-center gap-2 font-semibold">
          <Settings className="h-4 w-4" /> Settings
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <h3 className="mb-2 text-sm font-medium">Theme</h3>
          <div className="flex gap-2">
            {THEMES.map((t) => (
              <Choice key={t.value} value={t.value} current={preferences.theme} onPick={(theme) => onChange({ theme })}>
                <span className="mr-1.5 inline-block h-3 w-3 rounded-full border align-middle" style={{ background: t.swatch }} />
                {t.label}
              </Choice>
            ))}
          </div>
        </section>

        {format === "pdf" ? (
          <section>
            <h3 className="mb-2 text-sm font-medium">Zoom</h3>
            <div className="flex flex-wrap gap-2">
              {ZOOMS.map((z) => (
                <Choice key={String(z.value)} value={z.value} current={preferences.zoom} onPick={(zoom) => onChange({ zoom })}>
                  {z.label}
                </Choice>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section>
              <label htmlFor="reader-font" className="mb-2 flex justify-between text-sm font-medium">
                Text size <span className="text-muted-foreground">{Math.round(preferences.fontScale * 100)}%</span>
              </label>
              <input
                id="reader-font"
                type="range"
                min={70}
                max={180}
                step={5}
                value={Math.round(preferences.fontScale * 100)}
                onChange={(e) => onChange({ fontScale: Number(e.target.value) / 100 })}
                className="w-full"
              />
            </section>
            <section>
              <label htmlFor="reader-line" className="mb-2 flex justify-between text-sm font-medium">
                Line spacing <span className="text-muted-foreground">{preferences.lineHeight.toFixed(1)}</span>
              </label>
              <input
                id="reader-line"
                type="range"
                min={12}
                max={20}
                step={1}
                value={Math.round(preferences.lineHeight * 10)}
                onChange={(e) => onChange({ lineHeight: Number(e.target.value) / 10 })}
                className="w-full"
              />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium">Layout</h3>
              <div className="flex gap-2">
                <Choice<ReaderPreferences["flow"]> value="paginated" current={preferences.flow} onPick={(flow) => onChange({ flow })}>
                  Pages
                </Choice>
                <Choice<ReaderPreferences["flow"]> value="scrolled" current={preferences.flow} onPick={(flow) => onChange({ flow })}>
                  Scroll
                </Choice>
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
