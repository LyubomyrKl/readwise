"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGesture } from "@use-gesture/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  List,
  Minus,
  Plus,
  Settings,
  X,
  Sun,
  Moon,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Summary } from "./types";

// ============================================================================
// Types
// ============================================================================

interface Section {
  id: string;
  title: string;
  content: string;
  level: "chapter" | "section";
  chapterNum: number;
  sectionNum?: number;
}

interface ReaderTheme {
  name: string;
  bg: string;
  text: string;
  muted: string;
  accent: string;
}

// ============================================================================
// Constants
// ============================================================================

const THEMES: Record<string, ReaderTheme> = {
  light: { name: "Light", bg: "#FAFAFA", text: "#1C1C1E", muted: "#8E8E93", accent: "#007AFF" },
  dark: { name: "Dark", bg: "#1C1C1E", text: "#F5F5F7", muted: "#8E8E93", accent: "#0A84FF" },
  sepia: { name: "Sepia", bg: "#F8F4E9", text: "#3D3229", muted: "#8B7E6A", accent: "#B8860B" },
};

const FONTS = {
  serif: { name: "Serif", family: "Georgia, 'Times New Roman', serif" },
  sans: { name: "Sans", family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  mono: { name: "Mono", family: "ui-monospace, SFMono-Regular, monospace" },
};

/** Reading settings, shared by every summary. */
const SETTINGS_KEY = "summary-reader";
/** The section index, per summary: another summary has other sections. */
const POSITION_KEY = (summaryId: string) => `summary-reader.position.${summaryId}`;

// ============================================================================
// Helpers
// ============================================================================

const getContent = (section: { content?: string; summary?: { content: string }; chunks?: { content: string }[] }): string => {
  // Try direct content first
  if (section.content) return section.content;
  // Then try summary.content
  if (section.summary?.content) return section.summary.content;
  // Then try concatenating chunks
  if (section.chunks?.length) {
    return section.chunks.map(c => c.content).join("\n\n");
  }
  return "";
};

const flattenSections = (summary: Summary): Section[] => {
  const sections: Section[] = [];

  summary.sections.forEach((chapter, chapterIdx) => {
    const chapterContent = getContent(chapter);

    // Only add chapter as a section if it has content or no subsections
    if (chapterContent || !chapter.subsections?.length) {
      sections.push({
        id: chapter.id,
        title: chapter.title,
        content: chapterContent,
        level: "chapter",
        chapterNum: chapterIdx + 1,
      });
    }

    chapter.subsections?.forEach((sub, subIdx) => {
      sections.push({
        id: sub.id,
        title: sub.title,
        content: getContent(sub),
        level: "section",
        chapterNum: chapterIdx + 1,
        sectionNum: subIdx + 1,
      });
    });
  });

  return sections;
};

// ============================================================================
// Components
// ============================================================================

export const SummaryReader = ({ summary, summaryId }: { summary: Summary; summaryId: string }) => {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // State
  const [sections] = useState(() => flattenSections(summary));
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showUI, setShowUI] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Settings
  const [theme, setTheme] = useState<string>("light");
  const [font, setFont] = useState<string>("serif");
  const [fontSize, setFontSize] = useState(20);
  const [lineHeight, setLineHeight] = useState(1.8);

  const currentSection = sections[currentIdx];
  const progress = Math.round(((currentIdx + 1) / sections.length) * 100);
  const t = THEMES[theme];
  const f = FONTS[font as keyof typeof FONTS];

  // Persist settings (shared) and the position (per summary)
  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.theme) setTheme(data.theme);
        if (data.font) setFont(data.font);
        if (data.fontSize) setFontSize(data.fontSize);
        if (data.lineHeight) setLineHeight(data.lineHeight);
      } catch {}
    }
    // clamped: whatever storage holds, the index must point at one of these sections
    const savedIdx = Number(localStorage.getItem(POSITION_KEY(summaryId)));
    if (Number.isInteger(savedIdx) && savedIdx > 0) {
      setCurrentIdx(Math.max(0, Math.min(savedIdx, sections.length - 1)));
    }
  }, [summaryId, sections.length]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme, font, fontSize, lineHeight }));
  }, [theme, font, fontSize, lineHeight]);

  useEffect(() => {
    localStorage.setItem(POSITION_KEY(summaryId), String(currentIdx));
  }, [summaryId, currentIdx]);

  // Navigation
  const goTo = useCallback((idx: number) => {
    if (idx >= 0 && idx < sections.length) {
      setCurrentIdx(idx);
      contentRef.current?.scrollTo({ top: 0 });
    }
  }, [sections.length]);

  const next = useCallback(() => goTo(currentIdx + 1), [currentIdx, goTo]);
  const prev = useCallback(() => goTo(currentIdx - 1), [currentIdx, goTo]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showTOC || showSettings) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.key === "Escape") setShowUI(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev, showTOC, showSettings]);

  // Gestures
  useGesture(
    {
      onDragEnd: ({ swipe: [sx] }) => {
        if (showTOC || showSettings) return;
        if (sx === -1) next();
        if (sx === 1) prev();
      },
    },
    { target: containerRef, eventOptions: { passive: true } }
  );

  if (!currentSection) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ backgroundColor: t.bg }}
      >
        <p style={{ color: t.muted }}>This summary has no sections.</p>
        <button onClick={() => router.back()} className="text-sm font-medium" style={{ color: t.accent }}>
          Go back
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 transition-colors duration-300"
      style={{ backgroundColor: t.bg }}
    >
      {/* ===== Progress Bar ===== */}
      <div className="fixed top-0 left-0 right-0 h-[3px] z-50" style={{ backgroundColor: `${t.muted}30` }}>
        <motion.div
          className="h-full"
          style={{ backgroundColor: t.accent }}
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>

      {/* ===== Main Content ===== */}
      <div
        ref={contentRef}
        className="h-full overflow-y-auto overscroll-contain"
        onClick={() => !showTOC && !showSettings && setShowUI(!showUI)}
      >
        <div className="min-h-full flex flex-col justify-center px-6 py-20 md:px-12 lg:px-20">
          <div className="w-full max-w-[680px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.article
                key={currentSection.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              >
                {/* Header */}
                <header className="mb-10">
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-sm font-medium tracking-widest uppercase mb-4"
                    style={{ color: t.accent }}
                  >
                    {currentSection.level === "chapter"
                      ? `Chapter ${currentSection.chapterNum}`
                      : `Section ${currentSection.chapterNum}.${currentSection.sectionNum}`}
                  </motion.p>
                  <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="font-bold leading-[1.15] tracking-tight break-words"
                    style={{
                      color: t.text,
                      fontSize: currentSection.level === "chapter" ? "2.5rem" : "2rem",
                      fontFamily: f.family,
                    }}
                  >
                    {currentSection.title}
                  </motion.h1>
                </header>

                {/* Content */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="prose prose-lg max-w-none"
                  style={{
                    fontFamily: f.family,
                    fontSize: `${fontSize}px`,
                    lineHeight: lineHeight,
                    color: t.text,
                  }}
                >
                  {currentSection.content ? (
                    currentSection.content.split(/\n\n+/).map((para, i) => (
                      <p key={i} className="mb-6 last:mb-0">
                        {para}
                      </p>
                    ))
                  ) : (
                    <p className="text-center" style={{ color: t.muted }}>No content available</p>
                  )}
                </motion.div>

                {/* Footer Navigation Hint */}
                <motion.footer
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mt-16 pt-8 border-t flex items-center justify-between"
                  style={{ borderColor: `${t.muted}30` }}
                >
                  <span className="text-sm" style={{ color: t.muted }}>
                    {currentIdx + 1} of {sections.length}
                  </span>
                  {currentIdx < sections.length - 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); next(); }}
                      className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
                      style={{ color: t.accent }}
                    >
                      Next section
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </motion.footer>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ===== Navigation Touch Zones ===== */}
      <div
        className="fixed top-0 left-0 w-20 h-full z-10 cursor-w-resize"
        onClick={(e) => { e.stopPropagation(); prev(); }}
      />
      <div
        className="fixed top-0 right-0 w-20 h-full z-10 cursor-e-resize"
        onClick={(e) => { e.stopPropagation(); next(); }}
      />

      {/* ===== UI Overlay ===== */}
      <AnimatePresence>
        {showUI && !showTOC && !showSettings && (
          <>
            {/* Top Bar */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="fixed top-4 left-4 right-4 z-40 flex justify-center"
            >
              <div
                className="flex items-center gap-1 p-1.5 rounded-2xl shadow-lg backdrop-blur-xl"
                style={{ backgroundColor: `${t.bg}E6`, border: `1px solid ${t.muted}30` }}
                onClick={(e) => e.stopPropagation()}
              >
                <IconButton icon={ArrowLeft} onClick={() => router.back()} theme={t} />
                <Divider theme={t} />
                <IconButton icon={List} onClick={() => setShowTOC(true)} theme={t} />
                <Divider theme={t} />
                <IconButton icon={ChevronLeft} onClick={prev} disabled={currentIdx === 0} theme={t} />
                <IconButton icon={ChevronRight} onClick={next} disabled={currentIdx === sections.length - 1} theme={t} />
                <Divider theme={t} />
                <IconButton icon={Minus} onClick={() => setFontSize(Math.max(14, fontSize - 2))} theme={t} />
                <span className="w-8 text-center text-xs font-medium" style={{ color: t.text }}>{fontSize}</span>
                <IconButton icon={Plus} onClick={() => setFontSize(Math.min(28, fontSize + 2))} theme={t} />
                <Divider theme={t} />
                <IconButton icon={Settings} onClick={() => setShowSettings(true)} theme={t} />
              </div>
            </motion.div>

            {/* Bottom Progress */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-5 py-2.5 rounded-full shadow-lg backdrop-blur-xl"
                style={{ backgroundColor: `${t.bg}E6`, border: `1px solid ${t.muted}30` }}
              >
                <span className="text-sm font-medium" style={{ color: t.text }}>
                  {progress}% complete
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== Table of Contents ===== */}
      <AnimatePresence>
        {showTOC && (
          <TOCSheet
            sections={sections}
            currentIdx={currentIdx}
            theme={t}
            onSelect={(idx) => { goTo(idx); setShowTOC(false); }}
            onClose={() => setShowTOC(false)}
          />
        )}
      </AnimatePresence>

      {/* ===== Settings ===== */}
      <AnimatePresence>
        {showSettings && (
          <SettingsSheet
            theme={theme}
            font={font}
            fontSize={fontSize}
            lineHeight={lineHeight}
            onThemeChange={setTheme}
            onFontChange={setFont}
            onFontSizeChange={setFontSize}
            onLineHeightChange={setLineHeight}
            onClose={() => setShowSettings(false)}
            t={t}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================================================
// Sub-components
// ============================================================================

const IconButton = ({
  icon: Icon,
  onClick,
  disabled,
  theme,
}: {
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  theme: ReaderTheme;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "w-10 h-10 flex items-center justify-center rounded-xl transition-all",
      disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
    )}
  >
    <Icon className="w-5 h-5" style={{ color: theme.text }} />
  </button>
);

const Divider = ({ theme }: { theme: ReaderTheme }) => (
  <div className="w-px h-6 mx-1" style={{ backgroundColor: `${theme.muted}30` }} />
);

const TOCSheet = ({
  sections,
  currentIdx,
  theme,
  onSelect,
  onClose,
}: {
  sections: Section[];
  currentIdx: number;
  theme: ReaderTheme;
  onSelect: (idx: number) => void;
  onClose: () => void;
}) => (
  <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
      onClick={onClose}
    />
    <motion.div
      initial={{ x: "-100%" }}
      animate={{ x: 0 }}
      exit={{ x: "-100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed top-0 left-0 bottom-0 w-full max-w-sm z-50 shadow-2xl overflow-hidden"
      style={{ backgroundColor: theme.bg }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: `${theme.muted}20` }}>
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5" style={{ color: theme.accent }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.text }}>Contents</h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
          >
            <X className="w-5 h-5" style={{ color: theme.muted }} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {sections.map((section, idx) => {
            const isActive = idx === currentIdx;
            const isChapter = section.level === "chapter";

            return (
              <button
                key={section.id}
                onClick={() => onSelect(idx)}
                className={cn(
                  "w-full text-left p-4 rounded-xl mb-1 transition-all",
                  isActive ? "scale-[0.98]" : "hover:bg-black/5 active:scale-[0.98]",
                  !isChapter && "pl-8"
                )}
                style={{
                  backgroundColor: isActive ? `${theme.accent}15` : "transparent",
                }}
              >
                <p
                  className={cn("font-medium leading-snug break-words", isChapter ? "text-base" : "text-sm")}
                  style={{ color: isActive ? theme.accent : theme.text }}
                >
                  {isChapter ? `${section.chapterNum}. ` : ""}
                  {section.title}
                </p>
                {!isChapter && (
                  <p className="text-xs mt-1" style={{ color: theme.muted }}>
                    Section {section.chapterNum}.{section.sectionNum}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  </>
);

const SettingsSheet = ({
  theme,
  font,
  fontSize,
  lineHeight,
  onThemeChange,
  onFontChange,
  onFontSizeChange,
  onLineHeightChange,
  onClose,
  t,
}: {
  theme: string;
  font: string;
  fontSize: number;
  lineHeight: number;
  onThemeChange: (v: string) => void;
  onFontChange: (v: string) => void;
  onFontSizeChange: (v: number) => void;
  onLineHeightChange: (v: number) => void;
  onClose: () => void;
  t: ReaderTheme;
}) => (
  <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
      onClick={onClose}
    />
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed top-0 right-0 bottom-0 w-full max-w-sm z-50 shadow-2xl overflow-hidden"
      style={{ backgroundColor: t.bg }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: `${t.muted}20` }}>
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5" style={{ color: t.accent }} />
            <h2 className="text-lg font-semibold" style={{ color: t.text }}>Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
          >
            <X className="w-5 h-5" style={{ color: t.muted }} />
          </button>
        </div>

        {/* Settings */}
        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          {/* Theme */}
          <div>
            <h3 className="text-sm font-semibold mb-4 tracking-wide uppercase" style={{ color: t.muted }}>
              Theme
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(THEMES).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => onThemeChange(key)}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                    theme === key ? "scale-[0.95]" : "hover:scale-[0.98]"
                  )}
                  style={{
                    backgroundColor: value.bg,
                    borderColor: theme === key ? value.accent : `${value.muted}30`,
                  }}
                >
                  {key === "light" && <Sun className="w-5 h-5" style={{ color: value.text }} />}
                  {key === "dark" && <Moon className="w-5 h-5" style={{ color: value.text }} />}
                  {key === "sepia" && <BookOpen className="w-5 h-5" style={{ color: value.text }} />}
                  <span className="text-xs font-medium" style={{ color: value.text }}>{value.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font */}
          <div>
            <h3 className="text-sm font-semibold mb-4 tracking-wide uppercase" style={{ color: t.muted }}>
              Font
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(FONTS).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => onFontChange(key)}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all",
                    font === key ? "scale-[0.95]" : "hover:scale-[0.98]"
                  )}
                  style={{
                    borderColor: font === key ? t.accent : `${t.muted}30`,
                    fontFamily: value.family,
                  }}
                >
                  <span className="text-lg font-medium block mb-1" style={{ color: t.text }}>Aa</span>
                  <span className="text-xs" style={{ color: t.muted }}>{value.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <h3 className="text-sm font-semibold mb-4 tracking-wide uppercase" style={{ color: t.muted }}>
              Size
            </h3>
            <div
              className="flex items-center justify-between p-2 rounded-2xl"
              style={{ backgroundColor: `${t.muted}10` }}
            >
              <button
                onClick={() => onFontSizeChange(Math.max(14, fontSize - 2))}
                className="w-12 h-12 flex items-center justify-center rounded-xl hover:bg-black/5 transition-colors"
              >
                <Minus className="w-5 h-5" style={{ color: t.text }} />
              </button>
              <span className="text-2xl font-semibold" style={{ color: t.text }}>{fontSize}</span>
              <button
                onClick={() => onFontSizeChange(Math.min(28, fontSize + 2))}
                className="w-12 h-12 flex items-center justify-center rounded-xl hover:bg-black/5 transition-colors"
              >
                <Plus className="w-5 h-5" style={{ color: t.text }} />
              </button>
            </div>
          </div>

          {/* Line Height */}
          <div>
            <h3 className="text-sm font-semibold mb-4 tracking-wide uppercase" style={{ color: t.muted }}>
              Line Spacing
            </h3>
            <div
              className="flex items-center justify-between p-2 rounded-2xl"
              style={{ backgroundColor: `${t.muted}10` }}
            >
              <button
                onClick={() => onLineHeightChange(Math.max(1.4, lineHeight - 0.1))}
                className="w-12 h-12 flex items-center justify-center rounded-xl hover:bg-black/5 transition-colors"
              >
                <Minus className="w-5 h-5" style={{ color: t.text }} />
              </button>
              <span className="text-2xl font-semibold" style={{ color: t.text }}>{lineHeight.toFixed(1)}</span>
              <button
                onClick={() => onLineHeightChange(Math.min(2.4, lineHeight + 0.1))}
                className="w-12 h-12 flex items-center justify-center rounded-xl hover:bg-black/5 transition-colors"
              >
                <Plus className="w-5 h-5" style={{ color: t.text }} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  </>
);

export default SummaryReader;
