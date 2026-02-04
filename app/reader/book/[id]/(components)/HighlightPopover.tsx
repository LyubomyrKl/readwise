"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Highlighter, MessageSquarePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "#ffe066" },
  { name: "Green", value: "#69db7c" },
  { name: "Blue", value: "#74c0fc" },
  { name: "Pink", value: "#fcc2d7" },
  { name: "Orange", value: "#ffc078" },
];

type HighlightPopoverProps = {
  position: { x: number; y: number };
  selectedText: string;
  onHighlight: (color: string) => void;
  onAddNote: () => void;
  onClose: () => void;
};

export default function HighlightPopover({
  position,
  selectedText,
  onHighlight,
  onAddNote,
  onClose,
}: HighlightPopoverProps) {
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0].value);

  if (!selectedText.trim()) return null;

  return (
    <div
      className="fixed z-50 bg-background border rounded-lg shadow-xl p-2 flex items-center gap-2"
      style={{
        left: Math.min(position.x, window.innerWidth - 250),
        top: Math.max(position.y - 50, 10),
      }}
    >
      {/* Color picker */}
      <div className="flex gap-1">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.value}
            className={cn(
              "w-6 h-6 rounded-full border-2 transition-transform hover:scale-110",
              selectedColor === color.value
                ? "border-foreground scale-110"
                : "border-transparent"
            )}
            style={{ backgroundColor: color.value }}
            onClick={() => setSelectedColor(color.value)}
            title={color.name}
          />
        ))}
      </div>

      <div className="w-px h-6 bg-border" />

      {/* Highlight button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onHighlight(selectedColor)}
        className="h-8 px-2"
      >
        <Highlighter className="h-4 w-4 mr-1" />
        Highlight
      </Button>

      {/* Add note button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onAddNote}
        className="h-8 px-2"
      >
        <MessageSquarePlus className="h-4 w-4 mr-1" />
        Note
      </Button>

      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="h-6 w-6"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

export { HIGHLIGHT_COLORS };
