"use client";

import "pdfjs-dist/legacy/web/pdf_viewer.css";
import "./reader.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, List, Loader2, Search, Settings, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type {
  CreateHighlightDto,
  CreateNoteDto,
  HighlightResponse,
  IBook,
  NoteResponse,
  UpdateHighlightDto,
  UpdateNoteDto,
} from "@tools/reader/types";
import HighlightPopover, { HIGHLIGHT_COLORS } from "../HighlightPopover";
import NotesPanel from "../NotesPanel";
import { createEngine, formatOf, type ShellEngine } from "../engines/createEngine";
import type { HighlightItem, OpenedBook, ReaderPreferences, Relocation, TextSelection, TocItem, ViewportRect } from "../engines/types";
import { normalizeText, toLocator, type Locator } from "../locator";
import SearchPanel from "./SearchPanel";
import SettingsPanel from "./SettingsPanel";
import TocPanel from "./TocPanel";
import { usePreferences } from "./usePreferences";

type Panel = "toc" | "search" | "notes" | "settings" | null;

export type ReaderShellProps = {
  book: IBook & { renditionUrl?: string | null };
  /** the stored position as it is (Locator v2, or the v1 shape) */
  startPosition: unknown;
  highlights: HighlightResponse[];
  notes: NoteResponse[];
  onBack: () => void;
  onPositionChange: (locator: Locator) => void;
  onCreateHighlight: (dto: CreateHighlightDto) => Promise<HighlightResponse | null>;
  onUpdateHighlight: (id: string, dto: UpdateHighlightDto) => Promise<boolean>;
  onDeleteHighlight: (id: string) => Promise<boolean>;
  onCreateNote: (dto: CreateNoteDto) => Promise<NoteResponse | null>;
  onUpdateNote: (id: string, dto: UpdateNoteDto) => Promise<boolean>;
  onDeleteNote: (id: string) => Promise<boolean>;
};

const BACKGROUND: Record<ReaderPreferences["theme"], { book: string; pdf: string; text: string }> = {
  light: { book: "#ffffff", pdf: "#eceef1", text: "#1f1f1f" },
  sepia: { book: "#f4ecd8", pdf: "#e8dfc8", text: "#3b2f20" },
  dark: { book: "#1e1e1e", pdf: "#141414", text: "#e3e3e3" },
};

/**
 * One reader for every format: the chrome (contents, search, notes and highlights, settings,
 * progress, keys) around an engine that renders the book (PdfEngine or ReflowEngine). Everything
 * stored goes through Locator v2 (docs/document-architecture.md).
 */
export default function ReaderShell(props: ReaderShellProps) {
  const { book, highlights, notes } = props;
  const format = formatOf(book.mime, book.fileUrl);
  const host = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ShellEngine | null>(null);
  const [opened, setOpened] = useState<OpenedBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [relocation, setRelocation] = useState<Relocation | null>(null);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [active, setActive] = useState<{ id: string; rect: ViewportRect | null } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [preferences, updatePreferences] = usePreferences();

  // the engine is created once per book; it calls back through these refs
  const latest = useRef(props);
  latest.current = props;
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  useEffect(() => {
    let cancelled = false;
    let engine: ShellEngine | null = null;
    const start = toLocator(latest.current.startPosition, format);
    void (async () => {
      try {
        engine = await createEngine(
          { fileUrl: book.fileUrl, mime: book.mime, id: book.id, renditionUrl: book.renditionUrl ?? null },
          {
            onRelocate: (r) => {
              setRelocation(r);
              latest.current.onPositionChange(r.locator);
            },
            onSelection: (s) => {
              setSelection(s);
              if (s) setActive(null);
            },
            onHighlightClick: (id, rect) => {
              setActive({ id, rect });
              setSelection(null);
            },
            onAnchorUpdate: (id, locator) => void latest.current.onUpdateHighlight(id, { anchor: locator }),
            onError: (e) => setError(e.message),
          },
        );
        if (cancelled || !host.current) {
          engine.destroy();
          return;
        }
        engineRef.current = engine;
        const book_ = await engine.open(host.current, start, preferencesRef.current);
        if (!cancelled) setOpened(book_);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      engine?.destroy();
      engineRef.current = null;
    };
    // a new engine only for another book; the rest is read through refs
  }, [book.id]);

  const items: HighlightItem[] = useMemo(
    () =>
      highlights.flatMap((h) => {
        const locator = toLocator(h.anchor, format);
        if (!locator) return [];
        // a v1 highlight knows its text only from the text column
        if (!locator.quote && h.text) locator.quote = { exact: normalizeText(h.text).trim() };
        return [{ id: h.id, locator, color: h.color || HIGHLIGHT_COLORS[0].value }];
      }),
    [highlights, format],
  );

  useEffect(() => {
    if (opened) engineRef.current?.setHighlights(items);
  }, [opened, items]);

  useEffect(() => {
    if (opened) engineRef.current?.setPreferences(preferences);
  }, [opened, preferences]);

  const goTo = useCallback(async (target: Locator | TocItem) => {
    await engineRef.current?.goTo(target);
  }, []);

  // keys: pages, panels, search
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setPanel("search");
        return;
      }
      if (event.key === "Escape") {
        if (selection || active) {
          setSelection(null);
          setActive(null);
          engineRef.current?.clearSelection();
        } else setPanel(null);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") void engineRef.current?.next();
      if (event.key === "ArrowLeft" || event.key === "PageUp") void engineRef.current?.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, active]);

  // ---- highlights and notes from a selection -------------------------------------------------

  const highlightSelection = async (color: string) => {
    if (!selection) return;
    const created = await props.onCreateHighlight({ text: selection.text.trim() || selection.locator.quote?.exact || "", anchor: selection.locator, color });
    if (!created) toast.error("The highlight could not be saved");
    engineRef.current?.clearSelection();
    setSelection(null);
  };

  const noteOnSelection = async () => {
    if (!selection) return;
    const quote = selection.locator.quote?.exact ?? selection.text.trim();
    await props.onCreateHighlight({ text: quote, anchor: selection.locator, color: HIGHLIGHT_COLORS[0].value });
    await props.onCreateNote({ body: `"${quote.length > 140 ? `${quote.slice(0, 140)}…` : quote}"\n\n`, anchor: selection.locator });
    engineRef.current?.clearSelection();
    setSelection(null);
    setPanel("notes");
  };

  const activeHighlight = active ? highlights.find((h) => h.id === active.id) : undefined;
  const colors = BACKGROUND[preferences.theme];
  const chrome = preferences.theme === "dark" ? "bg-neutral-900/95 text-neutral-100 border-neutral-800" : "bg-background/95 border-border";

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ background: format === "pdf" ? colors.pdf : colors.book, color: colors.text }}
      data-testid="reader-shell"
      data-format={format}
    >
      <header className={`flex h-12 shrink-0 items-center gap-1 border-b px-2 backdrop-blur ${chrome}`}>
        <Button variant="ghost" size="icon" onClick={props.onBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-medium" title={book.title}>
            {book.title}
          </p>
          {relocation?.tocLabel && <p className="truncate text-xs opacity-70">{relocation.tocLabel}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setPanel(panel === "toc" ? null : "toc")} aria-label="Contents" disabled={!opened}>
          <List className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setPanel(panel === "search" ? null : "search")} aria-label="Search" disabled={!opened}>
          <Search className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="relative" onClick={() => setPanel(panel === "notes" ? null : "notes")} aria-label="Notes and highlights">
          <StickyNote className="h-5 w-5" />
          {notes.length + highlights.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
              {notes.length + highlights.length}
            </span>
          )}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="Settings">
          <Settings className="h-5 w-5" />
        </Button>
      </header>

      <main className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0" data-theme={preferences.theme} />
        {!opened && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin opacity-60" aria-label="Opening the book" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md space-y-3 text-center" role="alert">
              <p className="font-medium">This book could not be opened.</p>
              <p className="text-sm opacity-70">{error}</p>
              <Button variant="outline" onClick={props.onBack}>
                Back
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className={`flex h-10 shrink-0 items-center gap-2 border-t px-2 text-xs ${chrome}`}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void engineRef.current?.prev()} aria-label="Previous page" disabled={!opened}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            className="relative h-1.5 flex-1 rounded-full bg-black/10 dark:bg-white/15"
            aria-label={`Progress ${relocation?.percent ?? 0}%`}
            disabled={!opened}
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              void engineRef.current?.goToPercent(((e.clientX - box.left) / box.width) * 100);
            }}
          >
            <span className="absolute inset-y-0 left-0 rounded-full bg-primary/80" style={{ width: `${relocation?.percent ?? 0}%` }} />
          </button>
          <span className="shrink-0 tabular-nums opacity-80" data-testid="reader-location">
            {relocation ? `${relocation.label} · ${relocation.percent}%` : ""}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void engineRef.current?.next()} aria-label="Next page" disabled={!opened}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </footer>

      {selection && (
        <HighlightPopover
          position={{ x: selection.rect.x + selection.rect.width / 2, y: selection.rect.y }}
          selectedText={selection.text}
          onHighlight={highlightSelection}
          onAddNote={noteOnSelection}
          onClose={() => {
            setSelection(null);
            engineRef.current?.clearSelection();
          }}
        />
      )}

      {active && activeHighlight && (
        <div
          className="fixed z-50 flex items-center gap-1 rounded-full border bg-popover p-1.5 text-popover-foreground shadow-lg"
          style={{
            left: Math.max(8, Math.min((active.rect?.x ?? window.innerWidth / 2) + (active.rect?.width ?? 0) / 2 - 110, window.innerWidth - 228)),
            top: Math.max(56, (active.rect?.y ?? 120) - 52),
          }}
          role="dialog"
          aria-label="Highlight"
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.name}
              className={`h-7 w-7 rounded-full border-2 ${activeHighlight.color === c.value ? "border-foreground" : "border-transparent"}`}
              style={{ background: c.value }}
              onClick={() => {
                void props.onUpdateHighlight(activeHighlight.id, { color: c.value });
                setActive(null);
              }}
            />
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Delete highlight"
            onClick={() => {
              void props.onDeleteHighlight(activeHighlight.id);
              setActive(null);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Close" onClick={() => setActive(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {panel === "toc" && opened && (
        <TocPanel
          toc={opened.toc}
          current={relocation?.tocLabel}
          onSelect={(item) => {
            void goTo(item);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "search" && engineRef.current && (
        <SearchPanel
          search={(q) => engineRef.current!.search(q)}
          onSelect={(hit) => void engineRef.current?.showSearchHit(hit)}
          onClose={() => {
            engineRef.current?.clearSearch();
            setPanel(null);
          }}
        />
      )}
      {panel === "settings" && <SettingsPanel format={format} preferences={preferences} onChange={updatePreferences} onClose={() => setPanel(null)} />}
      {panel === "notes" && (
        <NotesPanel
          notes={notes}
          highlights={highlights}
          onClose={() => setPanel(null)}
          onNavigateToNote={(note) => {
            const locator = toLocator(note.anchor, format);
            if (locator) void goTo(locator);
          }}
          onNavigateToHighlight={(h) => {
            const item = items.find((i) => i.id === h.id);
            if (item) void goTo(item.locator);
          }}
          onCreateNote={props.onCreateNote}
          onUpdateNote={props.onUpdateNote}
          onDeleteNote={props.onDeleteNote}
          onDeleteHighlight={props.onDeleteHighlight}
        />
      )}
    </div>
  );
}
