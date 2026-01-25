"use client";

import { EyeOff, Minus, Plus, RotateCcw } from "lucide-react";

interface EPUBReaderMenuProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  progress: number;
  onClose: () => void;
}

const DEFAULT_FONT_SIZE = 100;
const MIN_FONT_SIZE = 70;
const MAX_FONT_SIZE = 180;

export default function EPUBReaderMenu({
  fontSize,
  onFontSizeChange,
  progress,
  onClose,
}: EPUBReaderMenuProps) {
  return (
    <>
      <div className="fixed top-0 right-0 h-full w-72 bg-background/95 backdrop-blur-xl border-l border-border/50 shadow-2xl z-40">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <h2 className="text-lg font-semibold">Settings</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          </div>

          {/* Progress */}
          <div className="p-4 border-b border-border/30">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-muted/30 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Font Size */}
          <div className="p-4 space-y-4">
            <div className="space-y-3">
              <label className="text-sm font-medium">Font Size</label>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => onFontSizeChange(Math.max(MIN_FONT_SIZE, fontSize - 5))}
                  className="p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-lg font-medium">{fontSize}%</span>
                <button
                  onClick={() => onFontSizeChange(Math.min(MAX_FONT_SIZE, fontSize + 5))}
                  className="p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <input
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step="5"
                value={fontSize}
                onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>

          <div className="mt-auto p-4 border-t border-border/50">
            <button
              onClick={() => onFontSizeChange(DEFAULT_FONT_SIZE)}
              className="w-full p-2 text-sm rounded-lg border border-border/30 hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
      </div>

      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30"
        onClick={onClose}
      />
    </>
  );
}
