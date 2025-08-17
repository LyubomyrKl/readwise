"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Type,
  Palette,
  BookOpen,
  Eye,
  EyeOff,
  ChevronDown,
  Layout,
  Bookmark,
  Navigation,
  Minus,
  Plus,
  Sun,
  Moon,
  Coffee,
  RotateCcw,
} from "lucide-react";

interface EPUBSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'justify';
  theme: 'light' | 'dark' | 'sepia';
  backgroundColor: string;
  textColor: string;
  margin: number;
  columnCount: 1 | 2;
  readingMode: 'scroll' | 'paginated';
  showProgress: boolean;
  autoSave: boolean;
  animatePageTurns: boolean;
}

interface EPUBReaderMenuProps {
  settings: EPUBSettings;
  onSettingsChange: (settings: Partial<EPUBSettings>) => void;
  progress?: number;
}

export default function EPUBReaderMenu({
  settings,
  onSettingsChange,
  progress = 0,
}: EPUBReaderMenuProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const themes = [
    {
      name: "Light",
      value: "light" as const,
      bg: "#ffffff",
      text: "#1a1a1a",
      icon: Sun,
    },
    {
      name: "Dark",
      value: "dark" as const,
      bg: "#0a0a0a",
      text: "#ffffff",
      icon: Moon,
    },
    {
      name: "Sepia",
      value: "sepia" as const,
      bg: "#f4f1ea",
      text: "#5c4b37",
      icon: Coffee,
    },
  ];

  const fontFamilies = [
    { name: "Serif", value: "serif" },
    { name: "Sans Serif", value: "sans-serif" },
    { name: "Monospace", value: "monospace" },
  ];

  const updateSetting = <K extends keyof EPUBSettings>(
    key: K,
    value: EPUBSettings[K]
  ) => {
    onSettingsChange({ [key]: value });
  };

  const resetSettings = () => {
    const defaultSettings: EPUBSettings = {
      fontSize: 16,
      fontFamily: "serif",
      lineHeight: 1.6,
      textAlign: "justify",
      theme: "light",
      backgroundColor: "#ffffff",
      textColor: "#1a1a1a",
      margin: 20,
      columnCount: 1,
      readingMode: "paginated",
      showProgress: true,
      autoSave: true,
      animatePageTurns: true,
    };
    onSettingsChange(defaultSettings);
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed top-4 right-4 z-50 p-3 rounded-full bg-background/80 backdrop-blur-md border border-border/50 shadow-lg hover:bg-background/90 transition-all duration-200 group"
        aria-label="Toggle settings"
      >
        <Settings className="h-5 w-5 transition-transform group-hover:rotate-90" />
      </button>

      {/* Settings Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-background/95 backdrop-blur-xl border-l border-border/50 shadow-2xl transition-transform duration-300 ease-out z-40 ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <h2 className="text-lg font-semibold">Reading Settings</h2>
            <button
              onClick={() => setIsVisible(false)}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          </div>

          {/* Progress Bar */}
          {settings.showProgress && (
            <div className="p-4 border-b border-border/30">
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full bg-muted/30 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Settings Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-6">
              {/* Theme Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Theme
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {themes.map((theme) => {
                    const IconComponent = theme.icon;
                    return (
                      <button
                        key={theme.value}
                        onClick={() => {
                          updateSetting("theme", theme.value);
                          updateSetting("backgroundColor", theme.bg);
                          updateSetting("textColor", theme.text);
                        }}
                        className={`p-3 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-1.5 ${
                          settings.theme === theme.value
                            ? "border-primary bg-primary/5"
                            : "border-border/30 hover:border-border/60"
                        }`}
                        style={{
                          backgroundColor:
                            settings.theme === theme.value
                              ? undefined
                              : `${theme.bg}20`,
                        }}
                      >
                        <IconComponent className="h-4 w-4" />
                        <span className="text-xs font-medium">{theme.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Typography Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Type className="h-4 w-4" />
                  Typography
                </h3>

                {/* Font Size */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">
                      Font Size
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateSetting("fontSize", Math.max(12, settings.fontSize - 1))
                        }
                        className="p-1 rounded hover:bg-muted/50"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-medium min-w-[2rem] text-center">
                        {settings.fontSize}
                      </span>
                      <button
                        onClick={() =>
                          updateSetting("fontSize", Math.min(24, settings.fontSize + 1))
                        }
                        className="p-1 rounded hover:bg-muted/50"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="12"
                    max="24"
                    value={settings.fontSize}
                    onChange={(e) =>
                      updateSetting("fontSize", parseInt(e.target.value))
                    }
                    className="w-full accent-primary"
                  />
                </div>

                {/* Font Family */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Font</label>
                  <div className="grid grid-cols-3 gap-1">
                    {fontFamilies.map((font) => (
                      <button
                        key={font.value}
                        onClick={() => updateSetting("fontFamily", font.value)}
                        className={`p-2 text-xs rounded border transition-colors ${
                          settings.fontFamily === font.value
                            ? "border-primary bg-primary/10"
                            : "border-border/30 hover:border-border/60"
                        }`}
                        style={{ fontFamily: font.value }}
                      >
                        {font.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Line Height */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">
                      Line Height
                    </label>
                    <span className="text-xs">{settings.lineHeight.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="1.2"
                    max="2.0"
                    step="0.1"
                    value={settings.lineHeight}
                    onChange={(e) =>
                      updateSetting("lineHeight", parseFloat(e.target.value))
                    }
                    className="w-full accent-primary"
                  />
                </div>
              </div>

              {/* Layout Section */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Layout className="h-4 w-4" />
                  Layout
                </h3>

                {/* Reading Mode */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Reading Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateSetting("readingMode", "paginated")}
                      className={`p-2 text-xs rounded border transition-colors ${
                        settings.readingMode === "paginated"
                          ? "border-primary bg-primary/10"
                          : "border-border/30 hover:border-border/60"
                      }`}
                    >
                      Paginated
                    </button>
                    <button
                      onClick={() => updateSetting("readingMode", "scroll")}
                      className={`p-2 text-xs rounded border transition-colors ${
                        settings.readingMode === "scroll"
                          ? "border-primary bg-primary/10"
                          : "border-border/30 hover:border-border/60"
                      }`}
                    >
                      Scroll
                    </button>
                  </div>
                </div>

                {/* Column Count */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Columns</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateSetting("columnCount", 1)}
                      className={`p-2 text-xs rounded border transition-colors ${
                        settings.columnCount === 1
                          ? "border-primary bg-primary/10"
                          : "border-border/30 hover:border-border/60"
                      }`}
                    >
                      Single
                    </button>
                    <button
                      onClick={() => updateSetting("columnCount", 2)}
                      className={`p-2 text-xs rounded border transition-colors ${
                        settings.columnCount === 2
                          ? "border-primary bg-primary/10"
                          : "border-border/30 hover:border-border/60"
                      }`}
                    >
                      Double
                    </button>
                  </div>
                </div>
              </div>

              {/* Preferences */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Preferences
                </h3>

                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Show Progress</span>
                    <input
                      type="checkbox"
                      checked={settings.showProgress}
                      onChange={(e) => updateSetting("showProgress", e.target.checked)}
                      className="accent-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Auto Save</span>
                    <input
                      type="checkbox"
                      checked={settings.autoSave}
                      onChange={(e) => updateSetting("autoSave", e.target.checked)}
                      className="accent-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Page Animations</span>
                    <input
                      type="checkbox"
                      checked={settings.animatePageTurns}
                      onChange={(e) =>
                        updateSetting("animatePageTurns", e.target.checked)
                      }
                      className="accent-primary"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border/50">
            <button
              onClick={resetSettings}
              className="w-full p-2 text-sm rounded-lg border border-border/30 hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isVisible && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
          onClick={() => setIsVisible(false)}
        />
      )}
    </>
  );
}