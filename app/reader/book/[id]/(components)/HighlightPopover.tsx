"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Highlighter, MessageSquarePlus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  onHighlight: (color: string) => void | Promise<void>;
  onAddNote: () => void | Promise<void>;
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
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);

  if (!selectedText.trim()) return null;

  const handleHighlight = async () => {
    setIsHighlighting(true);
    try {
      await onHighlight(selectedColor);
      toast.success("Text highlighted");
    } catch {
      toast.error("Failed to create highlight");
    } finally {
      setIsHighlighting(false);
    }
  };

  const handleAddNote = async () => {
    setIsAddingNote(true);
    try {
      await onAddNote();
    } catch {
      toast.error("Failed to add note");
    } finally {
      setIsAddingNote(false);
    }
  };

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
        onClick={handleHighlight}
        disabled={isHighlighting || isAddingNote}
        className="h-8 px-2"
      >
        {isHighlighting ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Highlighter className="h-4 w-4 mr-1" />
        )}
        Highlight
      </Button>

      {/* Add note button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleAddNote}
        disabled={isHighlighting || isAddingNote}
        className="h-8 px-2"
      >
        {isAddingNote ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <MessageSquarePlus className="h-4 w-4 mr-1" />
        )}
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
