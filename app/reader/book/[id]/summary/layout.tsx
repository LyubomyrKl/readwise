"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Settings,
  EyeOff,
  Type,
  Palette,
  Eye,
  Minus,
  Plus,
  Sun,
  Moon,
  Coffee,
  RotateCcw,
} from "lucide-react";

interface SummarySettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: 'light' | 'dark' | 'sepia';
  backgroundColor: string;
  textColor: string;
  showSectionNumbers: boolean;
  compactMode: boolean;
  highlightLevel: number;
  xPadding: number;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const [settings, setSettings] = useState<SummarySettings>({
    fontSize: 16,
    fontFamily: "serif",
    lineHeight: 1.6,
    theme: "sepia",
    backgroundColor: "#f4f1ea",
    textColor: "#5c4b37",
    showSectionNumbers: true,
    compactMode: false,
    highlightLevel: 2,
    xPadding: 32,
  });

  const updateSetting = <K extends keyof SummarySettings>(
    key: K,
    value: SummarySettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

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

  const resetSettings = () => {
    const defaultSettings: SummarySettings = {
      fontSize: 16,
      fontFamily: "serif",
      lineHeight: 1.6,
      theme: "sepia",
      backgroundColor: "#f4f1ea",
      textColor: "#5c4b37",
      showSectionNumbers: true,
      compactMode: false,
      highlightLevel: 2,
      xPadding: 32,
    };
    setSettings(defaultSettings);
  };

  return (
    <div 
      className="fixed inset-0 z-50 h-screen w-screen"
      style={{ backgroundColor: settings.backgroundColor }}
    >
      {/* Content with settings applied */}
      <div
        className="h-full overflow-y-auto"
        style={{
          fontSize: `${settings.fontSize}px`,
          lineHeight: settings.lineHeight,
          color: settings.textColor,
          fontFamily: settings.fontFamily,
          paddingLeft: `${settings.xPadding}px`,
          paddingRight: `${settings.xPadding}px`,
        }}
        onDoubleClick={() => {
          if (!menuVisible && !showSettings) {
            setMenuVisible(true);
          }
        }}
      >
        {children}
      </div>

      {/* Quick menu overlay - matches reader style */}
      {menuVisible && !showSettings && (
        <>
          {/* Backdrop to close menu when clicking outside */}
          <div
            className="absolute inset-0 z-20"
            onClick={() => setMenuVisible(false)}
          />
          <div className="absolute inset-0 z-20 pointer-events-none">
            {/* Simple centered quick menu */}
            <div className="pointer-events-auto absolute top-2 left-1/2 transform -translate-x-1/2">
              <div
                className="flex items-center gap-2 bg-background/95 rounded-full p-2 shadow-xl border"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Back */}
                <button
                  onClick={() => {
                    router.back();
                    setMenuVisible(false);
                  }}
                  className="p-2 hover:bg-muted/50 rounded-full transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                {/* Settings */}
                <button
                  onClick={() => {
                    setShowSettings(true);
                    setMenuVisible(false);
                  }}
                  className="p-2 hover:bg-muted/50 rounded-full transition-colors"
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <>
          <div
            className="fixed top-0 right-0 h-full w-80 bg-background/95 backdrop-blur-xl border-l border-border/50 shadow-2xl transition-transform duration-300 ease-out z-40 translate-x-0"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border/50">
                <h2 className="text-lg font-semibold">Summary Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <EyeOff className="h-4 w-4" />
                </button>
              </div>

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
                        <label className="text-xs text-muted-foreground">Font Size</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateSetting("fontSize", Math.max(12, settings.fontSize - 1))}
                            className="p-1 rounded hover:bg-muted/50"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-medium min-w-[2rem] text-center">
                            {settings.fontSize}
                          </span>
                          <button
                            onClick={() => updateSetting("fontSize", Math.min(24, settings.fontSize + 1))}
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
                        onChange={(e) => updateSetting("fontSize", parseInt(e.target.value))}
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
                        <label className="text-xs text-muted-foreground">Line Height</label>
                        <span className="text-xs">{settings.lineHeight.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="1.2"
                        max="2.0"
                        step="0.1"
                        value={settings.lineHeight}
                        onChange={(e) => updateSetting("lineHeight", parseFloat(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>

                  {/* Layout Section */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Layout
                    </h3>

                    {/* X Padding */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-muted-foreground">Side Margins</label>
                        <span className="text-xs">{settings.xPadding}px</span>
                      </div>
                      <input
                        type="range"
                        min="16"
                        max="80"
                        step="8"
                        value={settings.xPadding}
                        onChange={(e) => updateSetting("xPadding", parseInt(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>

                  {/* Display Options */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Display
                    </h3>

                    <div className="space-y-3">
                      <label className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Section Numbers</span>
                        <input
                          type="checkbox"
                          checked={settings.showSectionNumbers}
                          onChange={(e) => updateSetting("showSectionNumbers", e.target.checked)}
                          className="accent-primary"
                        />
                      </label>

                      <label className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Compact Mode</span>
                        <input
                          type="checkbox"
                          checked={settings.compactMode}
                          onChange={(e) => updateSetting("compactMode", e.target.checked)}
                          className="accent-primary"
                        />
                      </label>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-muted-foreground">Highlight Level</label>
                          <span className="text-xs">{settings.highlightLevel}</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="4"
                          step="1"
                          value={settings.highlightLevel}
                          onChange={(e) => updateSetting("highlightLevel", parseInt(e.target.value))}
                          className="w-full accent-primary"
                        />
                      </div>
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
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
            onClick={() => setShowSettings(false)}
          />
        </>
      )}
    </div>
  );
}