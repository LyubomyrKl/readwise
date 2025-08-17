"use client";

import { useState } from "react";
import {
  Settings,
  FileText,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize,
  Minimize,
  Layout,
  Monitor,
  BookOpen,
  Navigation,
  Minus,
  Plus,
  Search,
  Download,
  Bookmark,
  Sun,
  Moon,
} from "lucide-react";

interface PDFSettings {
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
  viewMode: 'single' | 'double' | 'continuous';
  fitMode: 'width' | 'height' | 'page' | 'auto';
  theme: 'light' | 'dark';
  showThumbnails: boolean;
  showBookmarks: boolean;
  invertColors: boolean;
  enableTextSelection: boolean;
  enableAnnotations: boolean;
  pageSpacing: number;
  backgroundColor: string;
}

interface PDFReaderMenuProps {
  settings: PDFSettings;
  onSettingsChange: (settings: Partial<PDFSettings>) => void;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export default function PDFReaderMenu({
  settings,
  onSettingsChange,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
}: PDFReaderMenuProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const viewModes = [
    { name: "Single", value: "single" as const, icon: Monitor },
    { name: "Double", value: "double" as const, icon: BookOpen },
    { name: "Continuous", value: "continuous" as const, icon: Layout },
  ];

  const fitModes = [
    { name: "Fit Width", value: "width" as const },
    { name: "Fit Height", value: "height" as const },
    { name: "Fit Page", value: "page" as const },
    { name: "Auto", value: "auto" as const },
  ];

  const updateSetting = <K extends keyof PDFSettings>(
    key: K,
    value: PDFSettings[K]
  ) => {
    onSettingsChange({ [key]: value });
  };

  const zoomIn = () => {
    const newZoom = Math.min(300, settings.zoom + 25);
    updateSetting("zoom", newZoom);
  };

  const zoomOut = () => {
    const newZoom = Math.max(25, settings.zoom - 25);
    updateSetting("zoom", newZoom);
  };

  const rotateClockwise = () => {
    const newRotation = ((settings.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    updateSetting("rotation", newRotation);
  };

  const rotateCounterClockwise = () => {
    const newRotation = ((settings.rotation - 90 + 360) % 360) as 0 | 90 | 180 | 270;
    updateSetting("rotation", newRotation);
  };

  const resetSettings = () => {
    const defaultSettings: PDFSettings = {
      zoom: 100,
      rotation: 0,
      viewMode: "single",
      fitMode: "width",
      theme: "light",
      showThumbnails: false,
      showBookmarks: false,
      invertColors: false,
      enableTextSelection: true,
      enableAnnotations: true,
      pageSpacing: 10,
      backgroundColor: "#ffffff",
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
            <h2 className="text-lg font-semibold">PDF Settings</h2>
            <button
              onClick={() => setIsVisible(false)}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          </div>

          {/* Page Navigation */}
          <div className="p-4 border-b border-border/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Navigation</span>
              <span className="text-xs text-muted-foreground">
                {currentPage} of {totalPages}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="p-2 rounded border border-border/30 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex-1 px-3 py-2 text-center border border-border/30 rounded bg-muted/20">
                {currentPage}
              </div>
              <button
                onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="p-2 rounded border border-border/30 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Settings Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-6">
              {/* Zoom Controls */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Zoom & View
                </h3>

                {/* Zoom Level */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Zoom</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={zoomOut}
                        className="p-1 rounded hover:bg-muted/50"
                      >
                        <ZoomOut className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-medium min-w-[3rem] text-center">
                        {settings.zoom}%
                      </span>
                      <button
                        onClick={zoomIn}
                        className="p-1 rounded hover:bg-muted/50"
                      >
                        <ZoomIn className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="25"
                    max="300"
                    step="25"
                    value={settings.zoom}
                    onChange={(e) => updateSetting("zoom", parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                {/* Fit Mode */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Fit Mode</label>
                  <div className="grid grid-cols-2 gap-1">
                    {fitModes.map((mode) => (
                      <button
                        key={mode.value}
                        onClick={() => updateSetting("fitMode", mode.value)}
                        className={`p-2 text-xs rounded border transition-colors ${
                          settings.fitMode === mode.value
                            ? "border-primary bg-primary/10"
                            : "border-border/30 hover:border-border/60"
                        }`}
                      >
                        {mode.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rotation */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Rotation</label>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={rotateCounterClockwise}
                      className="p-2 rounded border border-border/30 hover:bg-muted/50"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-medium">{settings.rotation}°</span>
                    <button
                      onClick={rotateClockwise}
                      className="p-2 rounded border border-border/30 hover:bg-muted/50"
                    >
                      <RotateCw className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* View Mode */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Layout className="h-4 w-4" />
                  Layout
                </h3>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">View Mode</label>
                  <div className="grid grid-cols-3 gap-1">
                    {viewModes.map((mode) => {
                      const IconComponent = mode.icon;
                      return (
                        <button
                          key={mode.value}
                          onClick={() => updateSetting("viewMode", mode.value)}
                          className={`p-2 rounded border transition-colors flex flex-col items-center gap-1 ${
                            settings.viewMode === mode.value
                              ? "border-primary bg-primary/10"
                              : "border-border/30 hover:border-border/60"
                          }`}
                        >
                          <IconComponent className="h-4 w-4" />
                          <span className="text-xs">{mode.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Page Spacing */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Page Spacing</label>
                    <span className="text-xs">{settings.pageSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={settings.pageSpacing}
                    onChange={(e) =>
                      updateSetting("pageSpacing", parseInt(e.target.value))
                    }
                    className="w-full accent-primary"
                  />
                </div>
              </div>

              {/* Theme */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Sun className="h-4 w-4" />
                  Theme
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      updateSetting("theme", "light");
                      updateSetting("backgroundColor", "#ffffff");
                    }}
                    className={`p-3 rounded-lg border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                      settings.theme === "light"
                        ? "border-primary bg-primary/5"
                        : "border-border/30 hover:border-border/60"
                    }`}
                  >
                    <Sun className="h-4 w-4" />
                    <span className="text-sm">Light</span>
                  </button>
                  <button
                    onClick={() => {
                      updateSetting("theme", "dark");
                      updateSetting("backgroundColor", "#1a1a1a");
                    }}
                    className={`p-3 rounded-lg border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                      settings.theme === "dark"
                        ? "border-primary bg-primary/5"
                        : "border-border/30 hover:border-border/60"
                    }`}
                  >
                    <Moon className="h-4 w-4" />
                    <span className="text-sm">Dark</span>
                  </button>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Features
                </h3>

                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Show Thumbnails</span>
                    <input
                      type="checkbox"
                      checked={settings.showThumbnails}
                      onChange={(e) =>
                        updateSetting("showThumbnails", e.target.checked)
                      }
                      className="accent-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Show Bookmarks</span>
                    <input
                      type="checkbox"
                      checked={settings.showBookmarks}
                      onChange={(e) =>
                        updateSetting("showBookmarks", e.target.checked)
                      }
                      className="accent-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Text Selection</span>
                    <input
                      type="checkbox"
                      checked={settings.enableTextSelection}
                      onChange={(e) =>
                        updateSetting("enableTextSelection", e.target.checked)
                      }
                      className="accent-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Annotations</span>
                    <input
                      type="checkbox"
                      checked={settings.enableAnnotations}
                      onChange={(e) =>
                        updateSetting("enableAnnotations", e.target.checked)
                      }
                      className="accent-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Invert Colors</span>
                    <input
                      type="checkbox"
                      checked={settings.invertColors}
                      onChange={(e) =>
                        updateSetting("invertColors", e.target.checked)
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