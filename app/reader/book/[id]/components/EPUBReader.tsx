"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useGesture } from "@use-gesture/react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ListTree,
  Settings,
  Moon,
  Sun,
  BookMarked,
  Type,
  Palette,
} from "lucide-react";
import { IBook } from "@/app/reader/types";

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
  const [toc, setToc] = useState<Array<{ href: string; label: string }>>([]);
  const [location, setLocation] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [chapter, setChapter] = useState<string>("");
  const [tocOpen, setTocOpen] = useState(false);
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

  // restore saved location
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY(book.id));
    if (saved) setLocation(saved);
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
    [book.id, onLocationPersistAction]
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
        if (e.key.toLowerCase() === "t") setTocOpen((v) => !v);
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

  const themeIcon =
    theme === "dark" ? (
      <Moon className="h-4 w-4" />
    ) : theme === "sepia" ? (
      <Palette className="h-4 w-4" />
    ) : (
      <Sun className="h-4 w-4" />
    );

  return (
    <div
      className="relative h-[calc(100dvh-0px)] w-full select-none"
      ref={containerRef}
    >
      {/* Top bar */}
      <div className="pointer-events-auto absolute inset-x-0 top-0 z-20 m-3">
        <div className="flex items-center gap-2 rounded-2xl bg-background/70 p-2 shadow-xl ring-1 ring-border backdrop-blur">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackAction}
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="text-sm font-medium line-clamp-1">
              {book.title}
              <span className="ml-2 text-muted-foreground">{book.author}</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={goPrev}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={goNext}
              aria-label="Next page"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>

            {/* TOC */}
            <Sheet open={tocOpen} onOpenChange={setTocOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Table of contents"
                >
                  <ListTree className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[320px]">
                <SheetHeader>
                  <SheetTitle>Contents</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-1 overflow-y-auto pr-2 text-sm">
                  {toc.map((item, i) => (
                    <button
                      key={`${item.href}-${i}`}
                      className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                      onClick={() => {
                        setTocOpen(false);
                        renditionRef.current?.display(item.href);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>

            {/* Settings */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Settings">
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Type className="h-4 w-4" />
                  Text size
                </DropdownMenuLabel>
                <div className="px-3 py-2">
                  <Slider
                    value={[fontPct]}
                    min={70}
                    max={180}
                    step={2}
                    onValueChange={(v) => setFontPct(v[0])}
                  />
                  <div className="mt-1 text-right text-xs text-muted-foreground">
                    {fontPct}%
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Theme
                </DropdownMenuLabel>
                <div className="grid grid-cols-3 gap-2 px-3 pb-2">
                  <Button
                    variant={theme === "light" ? "default" : "outline"}
                    onClick={() => setTheme("light")}
                  >
                    Light
                  </Button>
                  <Button
                    variant={theme === "sepia" ? "default" : "outline"}
                    onClick={() => setTheme("sepia")}
                  >
                    Sepia
                  </Button>
                  <Button
                    variant={theme === "dark" ? "default" : "outline"}
                    onClick={() => setTheme("dark")}
                  >
                    Dark
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Reader */}
      <div className="absolute inset-0">
        <ReactReader
          key={book.id}
          url={book.fileUrl}
          location={location ?? null}
          locationChanged={onLocationChanged}
          getRendition={onRendition}
          tocChanged={(toc) => setToc(toc as any)}
          epubOptions={{
            allowScriptedContent: true,
            // Some epubs need CORS-less fetch. Let the server set proper headers.
            // spread more options if needed
          }}
        />
      </div>

      {/* Bottom progress */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 m-3">
        <div className="rounded-2xl bg-background/70 p-3 shadow-xl ring-1 ring-border backdrop-blur">
          <div className="flex items-center gap-3">
            <BookMarked className="h-4 w-4 text-muted-foreground" />
            <Progress value={progress} className="h-2" />
            <div className="ml-auto text-xs tabular-nums text-muted-foreground">
              {progress}%
            </div>
          </div>
        </div>
      </div>

      {/* Floating theme indicator */}
      <div className="pointer-events-none absolute right-4 top-[68px] z-20 opacity-70">
        {themeIcon}
      </div>
    </div>
  );
}
