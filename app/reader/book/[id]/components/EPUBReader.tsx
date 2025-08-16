"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Settings, Bookmark } from "lucide-react";
import { IBook } from "@/app/reader/types";

type TocItem = { href: string; label: string; subitems?: TocItem[] };

export default function EPUBReader({ book }: { book: IBook }) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [fontPct, setFontPct] = useState(100);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [progress, setProgress] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  const keyCfi = `epub:cfi:${book.id}`;
  const keyTheme = `epub:theme:${book.id}`;
  const keyFont = `epub:font:${book.id}`;
  const keyBmk = `epub:bm:${book.id}`;

  // restore prefs
  useEffect(() => {
    try {
      const t = localStorage.getItem(keyTheme) as "light" | "dark" | null;
      const f = localStorage.getItem(keyFont);
      const b = localStorage.getItem(keyBmk);
      if (t) setTheme(t);
      if (f) setFontPct(Math.min(200, Math.max(70, Number(f))));
      if (b) setBookmarks(JSON.parse(b));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  useEffect(() => {
    let cancelled = false;

    const initializeReader = async () => {
      try {
        if (!viewerRef.current || !book.fileUrl) return;

        setIsLoading(true);
        setError(null);

        const { default: ePub } = await import("epubjs");

        // Robust fetch for S3 presigned URL
        let source: ArrayBuffer | string = book.fileUrl;
        try {
          const res = await fetch(book.fileUrl, {
            referrerPolicy: "no-referrer",
          });
          if (res.ok) source = await res.arrayBuffer();
        } catch {}

        bookRef.current = ePub(source as any);
        renditionRef.current = bookRef.current.renderTo(viewerRef.current, {
          width: "100%",
          height: "100%",
          spread: "none",
          flow: "paginated",
        });

        // Themes
        renditionRef.current.themes.register("light", {
          body: { background: "#ffffff", color: "#000000" },
          "p, h1, h2, h3, h4, h5, h6": { color: "#000000" },
        });
        renditionRef.current.themes.register("dark", {
          body: { background: "#1a1a1a", color: "#e5e5e5" },
          "p, h1, h2, h3, h4, h5, h6": { color: "#e5e5e5" },
          a: { color: "#e5e5e5" },
        });
        renditionRef.current.themes.select(theme);
        renditionRef.current.themes.fontSize(`${fontPct}%`);

        const startCfi = localStorage.getItem(keyCfi) || undefined;
        await renditionRef.current.display(startCfi);

        // TOC
        const nav = await bookRef.current.loaded.navigation;
        if (!cancelled) setToc(nav?.toc || []);

        // Locations for progress
        await bookRef.current.ready;
        await bookRef.current.locations.generate(1000);

        renditionRef.current.on("relocated", (loc: any) => {
          if (cancelled) return;
          try {
            const cfi = loc.start.cfi;
            const pct = bookRef.current.locations.percentageFromCfi(cfi);
            if (!Number.isNaN(pct)) {
              setProgress(Math.round(pct * 100));
              setCurrentLocation(cfi);
              localStorage.setItem(keyCfi, cfi);
            }
          } catch {}
        });

        setIsLoading(false);
      } catch (err) {
        console.error("Error loading EPUB:", err);
        setError(err instanceof Error ? err.message : "Failed to load EPUB");
        setIsLoading(false);
      }
    };

    initializeReader();

    return () => {
      cancelled = true;
      try {
        renditionRef.current?.destroy();
        bookRef.current?.destroy();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.fileUrl, book.id]);

  // live updates
  useEffect(() => {
    renditionRef.current?.themes.select(theme);
    try {
      localStorage.setItem(keyTheme, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontPct}%`);
    try {
      localStorage.setItem(keyFont, String(fontPct));
    } catch {}
  }, [fontPct]);

  // resize when TOC toggles or window changes
  useEffect(() => {
    const rsz = () => renditionRef.current?.resize?.();
    rsz();
    window.addEventListener("resize", rsz);
    return () => window.removeEventListener("resize", rsz);
  }, [tocOpen]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const next = useCallback(() => renditionRef.current?.next(), []);
  const prev = useCallback(() => renditionRef.current?.prev(), []);
  const goToHref = useCallback((href: string) => {
    setTocOpen(false);
    renditionRef.current
      ?.display(href)
      .then(() => renditionRef.current?.resize?.());
  }, []);

  const toggleBookmark = () => {
    if (!currentLocation) return;
    setBookmarks((prev) => {
      const next = prev.includes(currentLocation)
        ? prev.filter((b) => b !== currentLocation)
        : [...prev, currentLocation];
      try {
        localStorage.setItem(keyBmk, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  if (error) {
    return (
      <div className="grid h-[100dvh] place-items-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-red-600 mb-2">Error</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-[100dvh] grid-rows-[auto_auto_1fr_auto] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-semibold truncate max-w-[60vw]">
            {book.title}
          </h1>
          {progress > 0 && (
            <span className="text-sm text-muted-foreground">{progress}%</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleBookmark}
            className={`p-2 rounded-md transition-colors ${
              bookmarks.includes(currentLocation || "")
                ? "bg-yellow-100 text-yellow-700"
                : "text-muted-foreground hover:bg-muted"
            }`}
            aria-label="Toggle bookmark"
          >
            <Bookmark className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="p-2 rounded-md text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Settings */}
      {showSettings ? (
        <div className="p-4 border-b bg-muted/50">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">Theme</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setTheme("light")}
                  className={`px-3 py-1 text-xs rounded ${
                    theme === "light"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border"
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`px-3 py-1 text-xs rounded ${
                    theme === "dark"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border"
                  }`}
                >
                  Dark
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm">Font</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setFontPct((v) => Math.max(70, v - 10))}
                  className="px-2 py-1 text-xs bg-background border rounded"
                >
                  A-
                </button>
                <span className="px-2 py-1 text-xs">{fontPct}%</span>
                <button
                  onClick={() => setFontPct((v) => Math.min(200, v + 10))}
                  className="px-2 py-1 text-xs bg-background border rounded"
                >
                  A+
                </button>
              </div>
            </div>

            <button
              onClick={() => setTocOpen((v) => !v)}
              className="px-3 py-1 text-sm bg-background border rounded hover:bg-muted"
            >
              Table of Contents
            </button>
          </div>
        </div>
      ) : (
        <div className="h-0" />
      )}

      {/* Main area: no page scroll */}
      <div className="relative min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0">
          {/* TOC Sidebar */}
          {tocOpen && (
            <aside className="w-80 shrink-0 h-full overflow-y-auto border-r bg-background">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Table of Contents</h3>
                  <button
                    onClick={() => setTocOpen(false)}
                    className="p-1 hover:bg-muted rounded"
                    aria-label="Close TOC"
                  >
                    ×
                  </button>
                </div>
                <TocList toc={toc} onGo={goToHref} />
              </div>
            </aside>
          )}

          {/* Viewer */}
          <main className="relative flex-1 min-w-0 min-h-0 overflow-hidden">
            <div ref={viewerRef} className="h-full w-full" />

            {!isLoading && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 shadow hover:bg-background opacity-60 hover:opacity-100"
                  style={{ left: tocOpen ? 16 + 320 : 16 }}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  onClick={next}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 shadow hover:bg-background opacity-60 hover:opacity-100"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}

            {isLoading && (
              <div className="absolute inset-0 grid place-items-center bg-background/80">
                <div className="text-center">
                  <div className="animate-pulse text-muted-foreground mb-2">
                    Loading EPUB...
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {book.title}
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Progress */}
      {!isLoading && progress > 0 ? (
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : (
        <div className="h-1 bg-muted" />
      )}
    </div>
  );
}

function TocList({
  toc,
  onGo,
}: {
  toc: TocItem[];
  onGo: (href: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {toc.map((i, idx) => (
        <li key={`${i.href}-${idx}`}>
          <button
            className="w-full text-left rounded-lg px-2 py-1 hover:bg-accent hover:text-accent-foreground"
            onClick={() => onGo(i.href)}
            title={i.label}
          >
            {i.label}
          </button>
          {i.subitems?.length ? (
            <div className="ml-3 border-l pl-3">
              <TocList toc={i.subitems} onGo={onGo} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
