"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useGesture } from "@use-gesture/react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Palette,
  RotateCcw,
  Minus,
  Plus,
} from "lucide-react";
import { IBook } from "@/app/reader/types";
import EPUBReaderMenu from "./EPUBReaderMenu";

// react-reader needs window, load client-side only
const ReactReader = dynamic(
  () => import("react-reader").then((m) => m.ReactReader),
  { ssr: false }
);

// ---- Types ----

export type EPUBReaderProps = {
  book: IBook;
  onBackAction?: () => void;
  onCreateHighlightAction?: (h: { cfiRange: string; text?: string }) => void;
  onLocationPersistAction?: (
    bookId: string,
    cfi: string,
    progressPct: number
  ) => void;
};

// ---- Helpers ----
const STORAGE_KEY = (id: string) => `epub.cfi.${id}`;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const THEMES = {
  light: `
    body { background: #fafafa !important; color: #111 !important; }
    ::selection { background: rgba(0,0,0,.12); }
    p { line-height: 1.55; }
  `,
  sepia: `
    body { background: #f4ecd8 !important; color: #3b2f1a !important; }
    ::selection { background: rgba(0,0,0,.12); }
    p { line-height: 1.55; }
  `,
  dark: `
    body { background: #0b0b0c !important; color: #e7e7ea !important; }
    a { color: #9bbcff !important; }
    ::selection { background: rgba(255,255,255,.14); }
    p { line-height: 1.6; }
  `,
};

// ---- Component ----
export default function EPUBReader({
  book,
  onBackAction,
  onCreateHighlightAction,
  onLocationPersistAction,
}: EPUBReaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<any>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [lastPageCfi, setLastPageCfi] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<keyof typeof THEMES>(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("epub.theme") as any) || "light"
      : "light"
  );
  const [fontPct, setFontPct] = useState<number>(() =>
    typeof window !== "undefined"
      ? Number(localStorage.getItem("epub.fontPct") || 100)
      : 100
  );

  // EPUB Settings for the menu
  const [epubSettings, setEpubSettings] = useState({
    fontSize: fontPct,
    fontFamily: "serif" as "serif" | "sans-serif" | "monospace",
    lineHeight: 1.6,
    textAlign: "justify" as "left" | "center" | "justify",
    theme: theme,
    backgroundColor: theme === "dark" ? "#0b0b0c" : theme === "sepia" ? "#f4ecd8" : "#fafafa",
    textColor: theme === "dark" ? "#e7e7ea" : theme === "sepia" ? "#3b2f1a" : "#111",
    margin: 20,
    columnCount: 1 as 1 | 2,
    readingMode: "paginated" as "scroll" | "paginated",
    showProgress: true,
    autoSave: true,
    animatePageTurns: true,
  });

  // restore saved location
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY(book.id));
    const lastPage = localStorage.getItem(`epub.lastPage.${book.id}`);
    if (saved) setLocation(saved);
    if (lastPage) setLastPageCfi(lastPage);
  }, [book.id]);

  // gestures: swipe for next/prev, pinch for font size
  useGesture(
    {
      onDragEnd: ({ swipe: [sx] }) => {
        if (!renditionRef.current) return;
        if (sx === -1) renditionRef.current.next();
        if (sx === 1) renditionRef.current.prev();
      },
      onPinch: ({ da: [d] }) => {
        // da[0] ~ scale delta; map to font change
        if (!renditionRef.current) return;
        const next = clamp(
          Math.round(fontPct * (d > 1 ? 1.02 : 0.98)),
          70,
          180
        );
        if (next !== fontPct) setFontPct(next);
      },
    },
    { target: containerRef, eventOptions: { passive: true } }
  );

  // apply theme + font size once rendition is ready
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    try {
      r.themes.register("light", THEMES.light);
      r.themes.register("sepia", THEMES.sepia);
      r.themes.register("dark", THEMES.dark);
      r.themes.select(theme);
      r.themes.fontSize(`${fontPct}%`);
    } catch {}
  }, [theme, fontPct]);

  // persist prefs
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("epub.theme", theme);
  }, [theme]);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("epub.fontPct", String(fontPct));
  }, [fontPct]);

  const onLocationChanged = useCallback(
    async (epubcfi: string) => {
      // Save previous location as last page
      if (location && location !== epubcfi) {
        setLastPageCfi(location);
        localStorage.setItem(`epub.lastPage.${book.id}`, location);
      }
      
      setLocation(epubcfi);
      localStorage.setItem(STORAGE_KEY(book.id), epubcfi);
      const r = renditionRef.current;
      if (r && r.book && r.book.locations) {
        try {
          const pct = r.book.locations.percentageFromCfi(epubcfi) || 0;
          setProgress(Math.round(pct * 100));
          onLocationPersistAction?.(book.id, epubcfi, Math.round(pct * 100));
        } catch {}
      }
    },
    [book.id, location, onLocationPersistAction]
  );

  const onRendition = useCallback(
    (rendition: any) => {
      renditionRef.current = rendition;

      // flow and settings
      try {
        rendition.flow("paginated"); // better for swipes
        rendition.themes.register("light", THEMES.light);
        rendition.themes.register("sepia", THEMES.sepia);
        rendition.themes.register("dark", THEMES.dark);
        rendition.themes.select(theme);
        rendition.themes.fontSize(`${fontPct}%`);
      } catch {}

      // keyboard
      rendition.on("keyup", (e: KeyboardEvent) => {
        if (e.key === "ArrowRight") rendition.next();
        if (e.key === "ArrowLeft") rendition.prev();
        if (e.key === "+" || e.key === "=")
          setFontPct((f) => clamp(f + 5, 70, 180));
        if (e.key === "-") setFontPct((f) => clamp(f - 5, 70, 180));
        if (e.key.toLowerCase() === "t") setSettingsOpen((v: any) => !v);
      });

      // selection -> quick highlight
      rendition.on("selected", async (cfiRange: string, contents: any) => {
        try {
          contents.highlight(cfiRange, {}, undefined, {
            fill: "#ffe066",
            "fill-opacity": 0.35,
          });
        } catch {}
        const text = await rendition.book
          .getRange(cfiRange)
          ?.toString()
          .catch(() => "");
        onCreateHighlightAction?.({ cfiRange, text });
        rendition.annotations.remove(cfiRange, "highlight"); // keep UI minimal; rely on external highlight render below
        rendition.annotations.add("highlight", cfiRange, {}, undefined, {
          fill: "#ffe066",
          "fill-opacity": 0.35,
        });
        rendition.annotations.update();
        rendition.currentLocation(); // keep focus
      });
    },
    [theme, fontPct, onCreateHighlightAction]
  );

  // Render existing highlights when location or book changes
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    try {
      r.annotations?.removeAll?.();
      for (const h of book.highlights || []) {
        r.annotations.add("highlight", [], {}, undefined, {
          fill: h.color || "#ffd54f",
          "fill-opacity": 0.35,
        });
      }
      r.annotations.update();
    } catch {}
  }, [book.id, book.highlights, location]);

  const goPrev = () => renditionRef.current?.prev();
  const goNext = () => renditionRef.current?.next();
  const goToLastPage = () => {
    if (lastPageCfi && renditionRef.current) {
      renditionRef.current.display(lastPageCfi);
    }
  };

  // Auto-hide menu after interaction
  const hideMenuAfterDelay = () => {
    setTimeout(() => setMenuVisible(false), 3000);
  };

  // Handle settings changes from EPUBReaderMenu
  const handleSettingsChange = (newSettings: any) => {
    setEpubSettings(prev => ({ ...prev, ...newSettings }));
    
    // Sync with existing state
    if (newSettings.theme) {
      setTheme(newSettings.theme as keyof typeof THEMES);
    }
    if (newSettings.fontSize) {
      setFontPct(newSettings.fontSize);
    }
  };

  return (
    <div
      className="relative h-[calc(100dvh-0px)] w-full select-none"
      ref={containerRef}
    >
      {/* Tap area to show menu */}
      <div 
        className="absolute inset-0 z-10"
        onClick={() => setMenuVisible(!menuVisible)}
      />

      {/* Hidden menu overlay */}
      {menuVisible && !settingsOpen && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          {/* Top quick menu */}
          <div className="pointer-events-auto absolute top-4 left-4 right-4 flex items-center justify-between">
            {/* Left controls */}
            <div className="flex items-center gap-2 bg-background/90 rounded-lg p-2 shadow-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={onBackAction}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {lastPageCfi && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToLastPage}
                  aria-label="Go to last page"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Center title */}
            <div className="bg-background/90 rounded-lg p-2 shadow-lg max-w-md">
              <div className="text-sm font-medium text-center truncate">
                {book.title}
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2 bg-background/90 rounded-lg p-2 shadow-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSettingsOpen(true);
                  setMenuVisible(false);
                }}
                aria-label="Settings"
              >
                <Palette className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="pointer-events-auto absolute bottom-4 left-4 right-4">
            <div className="flex items-center justify-between bg-background/90 rounded-lg p-2 shadow-lg">
              {/* Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    goPrev();
                    hideMenuAfterDelay();
                  }}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    goNext();
                    hideMenuAfterDelay();
                  }}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Progress */}
              <div className="flex-1 mx-4">
                <div className="text-xs text-center mb-1">{progress}%</div>
                <div className="w-full bg-muted/50 rounded-full h-1">
                  <div 
                    className="bg-primary h-1 rounded-full transition-all" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Settings */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFontPct(f => Math.max(70, f - 10))}
                  aria-label="Decrease font size"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFontPct(f => Math.min(180, f + 10))}
                  aria-label="Increase font size"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const themes = ['light', 'sepia', 'dark'] as const;
                    const currentIndex = themes.indexOf(theme);
                    const nextTheme = themes[(currentIndex + 1) % themes.length];
                    setTheme(nextTheme);
                    hideMenuAfterDelay();
                  }}
                  aria-label="Change theme"
                >
                  {theme === "dark" ? <Moon className="h-4 w-4" /> : 
                   theme === "sepia" ? <Palette className="h-4 w-4" /> : 
                   <Sun className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reader */}
      <div className="absolute inset-0">
        <ReactReader
          key={book.id}
          url={book.fileUrl}
          location={location ?? null}
          locationChanged={onLocationChanged}
          getRendition={onRendition}
          epubOptions={{
            allowScriptedContent: true,
            // Some epubs need CORS-less fetch. Let the server set proper headers.
            // spread more options if needed
          }}
        />
      </div>

      {/* EPUBReaderMenu */}
      {settingsOpen && (
        <EPUBReaderMenu
          settings={epubSettings}
          onSettingsChange={handleSettingsChange}
          progress={progress}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
