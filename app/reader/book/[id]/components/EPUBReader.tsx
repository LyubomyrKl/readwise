// components/EpubReader.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Minimize2,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";

const IconBtn = (p: any) => (
  <button
    {...p}
    className={
      "inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm border " +
      "bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 " +
      "hover:bg-accent hover:text-accent-foreground transition"
    }
  />
);

export type EPUBBook = {
  id: string;
  title?: string;
  author?: string;
  fileUrl: string; // presigned S3 URL
};

type TocItem = { href: string; label: string; subitems?: TocItem[] };

export default function EpubReader({ book }: { book: EPUBBook }) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [fontPct, setFontPct] = useState(100);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [progress, setProgress] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const keyCfi = `epub:cfi:${book.id}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!viewerRef.current || !book.fileUrl) return;

      const { default: ePub } = await import("epubjs");

      // Robust fetch for S3 presigned URL. Falls back to URL if CORS allows.
      let source: ArrayBuffer | string = book.fileUrl;
      try {
        const res = await fetch(book.fileUrl, {
          referrerPolicy: "no-referrer",
        });
        if (res.ok) source = await res.arrayBuffer();
      } catch {
        // leave source as URL if direct fetch failed
      }

      bookRef.current = ePub(source as any);
      renditionRef.current = bookRef.current.renderTo(viewerRef.current, {
        width: "100%",
        height: "100%",
        spread: "auto",
        flow: "paginated",
        manager: "default",
      });

      // Themes
      renditionRef.current.themes.register("light", {
        body: { background: "transparent", color: "inherit" },
        "p, h1, h2, h3, h4, h5, h6": { color: "inherit" },
      });
      renditionRef.current.themes.register("dark", {
        body: { background: "transparent", color: "inherit" },
        "p, h1, h2, h3, h4, h5, h6": { color: "inherit" },
        a: { color: "inherit" },
      });
      renditionRef.current.themes.select(theme);
      renditionRef.current.themes.fontSize(`${fontPct}%`);

      const startCfi = localStorage.getItem(keyCfi) || undefined;
      await renditionRef.current.display(startCfi);

      // TOC
      const nav = await bookRef.current.loaded.navigation;
      if (!cancelled) setToc(nav.toc || []);

      // Locations for progress
      await bookRef.current.ready;
      await bookRef.current.locations.generate(1000);

      renditionRef.current.on("relocated", (loc: any) => {
        if (cancelled) return;
        try {
          const pct = bookRef.current.locations.percentageFromCfi(
            loc.start.cfi
          );
          if (!Number.isNaN(pct)) setProgress(Math.round(pct * 100));
          localStorage.setItem(keyCfi, loc.start.cfi);
        } catch {
          // ignore
        }
      });

      setReady(true);
    })();

    return () => {
      cancelled = true;
      try {
        renditionRef.current?.destroy();
        bookRef.current?.destroy();
      } catch {
        // ignore
      }
    };
  }, [book.fileUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    renditionRef.current?.themes.select(theme);
  }, [theme]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontPct}%`);
  }, [fontPct]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "+" || (e.key === "=" && (e.ctrlKey || e.metaKey)))
        setFontPct((v) => Math.min(200, v + 10));
      if (e.key === "-" || (e.key === "_" && (e.ctrlKey || e.metaKey)))
        setFontPct((v) => Math.max(70, v - 10));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const next = useCallback(() => renditionRef.current?.next(), []);
  const prev = useCallback(() => renditionRef.current?.prev(), []);
  const goToHref = useCallback((href: string) => {
    setTocOpen(false);
    renditionRef.current?.display(href);
  }, []);

  const toggleFs = useCallback(async () => {
    if (!document.fullscreenElement) {
      await viewerRef.current?.requestFullscreen?.();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top Navigation */}
      <div className="flex items-center justify-between p-4 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold truncate max-w-md">
            {book.title || "EPUB Reader"}
          </h1>
          {progress > 0 && (
            <span className="text-sm text-muted-foreground">
              {progress}%
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="px-3 py-1 text-sm bg-background border rounded hover:bg-muted transition-colors"
          >
            TOC
          </button>
          
          <button
            onClick={() => setTheme(t => t === "light" ? "dark" : "light")}
            className="p-2 rounded-md text-muted-foreground hover:bg-muted transition-colors"
            title="Toggle theme"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          
          <a 
            href={book.fileUrl} 
            download 
            target="_blank" 
            rel="noreferrer"
            className="p-2 rounded-md text-muted-foreground hover:bg-muted transition-colors"
            title="Download EPUB"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="p-4 border-b bg-muted/50">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm">Font Size:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setFontPct(v => Math.max(70, v - 10))}
                className="px-2 py-1 text-xs bg-background border rounded hover:bg-muted"
              >
                A-
              </button>
              <span className="px-2 py-1 text-xs">{fontPct}%</span>
              <button
                onClick={() => setFontPct(v => Math.min(200, v + 10))}
                className="px-2 py-1 text-xs bg-background border rounded hover:bg-muted"
              >
                A+
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm">Progress:</span>
            <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* TOC Sidebar */}
        {tocOpen && (
          <div className="absolute left-0 top-0 z-10 h-full w-80 overflow-y-auto border-r bg-background shadow-lg">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Table of Contents</h3>
                <button
                  onClick={() => setTocOpen(false)}
                  className="p-1 hover:bg-muted rounded"
                >
                  ×
                </button>
              </div>
              <TocList toc={toc} onGo={goToHref} />
            </div>
          </div>
        )}

        {/* EPUB Viewer */}
        <div 
          className={`h-full w-full bg-background transition-all duration-300 ${
            tocOpen ? 'ml-80' : ''
          }`} 
          ref={viewerRef}
          style={{
            backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
            color: theme === 'dark' ? '#e5e5e5' : '#000000'
          }}
        />
        
        {/* Navigation Buttons */}
        <button
          onClick={prev}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-background/80 shadow-lg hover:bg-background transition-all opacity-50 hover:opacity-100"
          style={{ left: tocOpen ? '336px' : '16px' }}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        
        <button
          onClick={next}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-background/80 shadow-lg hover:bg-background transition-all opacity-50 hover:opacity-100"
          aria-label="Next page"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Loading State */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center">
              <div className="animate-pulse text-muted-foreground mb-2">
                Loading EPUB...
              </div>
              <div className="text-xs text-muted-foreground">
                {book.title || "Document"}
              </div>
            </div>
          </div>
        )}
      </div>
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
          {i.subitems && i.subitems.length > 0 && (
            <div className="ml-3 border-l pl-3">
              <TocList toc={i.subitems} onGo={onGo} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
