"use client";

import { X, Minus, Plus, RotateCcw } from "lucide-react";

interface PDFReaderMenuProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  currentPage: number;
  totalPages: number;
  onClose: () => void;
}

const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 50;
const MAX_ZOOM = 400;

export default function PDFReaderMenu({
  zoom,
  onZoomChange,
  currentPage,
  totalPages,
  onClose,
}: PDFReaderMenuProps) {
  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  return (
    <>
      <div className="fixed top-0 right-0 h-full w-full sm:w-80 bg-background/95 backdrop-blur-xl border-l border-border/50 shadow-2xl z-40">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border/50">
            <h2 className="text-lg font-semibold">Settings</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted/50 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Page Info */}
          <div className="p-5 border-b border-border/30">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
              <span>Reading Progress</span>
              <span className="font-medium">{currentPage} / {totalPages}</span>
            </div>
            <div className="w-full bg-muted/30 rounded-full h-2.5">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-right">{progress}% complete</p>
          </div>

          {/* Zoom */}
          <div className="p-5 space-y-5">
            <div className="space-y-4">
              <label className="text-sm font-semibold">Zoom Level</label>
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => onZoomChange(Math.max(MIN_ZOOM, zoom - 15))}
                  className="w-12 h-12 flex items-center justify-center rounded-xl border border-border/50 hover:bg-muted/50 active:scale-95 transition-all"
                  aria-label="Zoom out"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <span className="text-2xl font-semibold min-w-[5rem] text-center">{zoom}%</span>
                <button
                  onClick={() => onZoomChange(Math.min(MAX_ZOOM, zoom + 15))}
                  className="w-12 h-12 flex items-center justify-center rounded-xl border border-border/50 hover:bg-muted/50 active:scale-95 transition-all"
                  aria-label="Zoom in"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step="5"
                value={zoom}
                onChange={(e) => onZoomChange(parseInt(e.target.value))}
                className="w-full h-2 accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{MIN_ZOOM}%</span>
                <span>{MAX_ZOOM}%</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-auto p-5 border-t border-border/50">
            <button
              onClick={() => onZoomChange(DEFAULT_ZOOM)}
              className="w-full h-12 text-sm rounded-xl border border-border/30 hover:bg-muted/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-5 w-5" />
              Reset to 100%
            </button>
          </div>
        </div>
      </div>

      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30"
        onClick={onClose}
      />
    </>
  );
}
