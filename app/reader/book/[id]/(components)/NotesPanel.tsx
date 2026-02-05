"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  X,
  Plus,
  Pin,
  Trash2,
  Edit2,
  Check,
  Highlighter,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  NoteResponse,
  HighlightResponse,
  CreateNoteDto,
  UpdateNoteDto,
  UpdateHighlightDto,
} from "@/lib/types";

type NotesPanelProps = {
  notes: NoteResponse[];
  highlights?: HighlightResponse[];
  showHighlights?: boolean;
  onClose: () => void;
  onNavigateToNote?: (note: NoteResponse) => void;
  onCreateNote?: (dto: CreateNoteDto) => Promise<NoteResponse | null>;
  onUpdateNote?: (id: string, dto: UpdateNoteDto) => Promise<boolean>;
  onDeleteNote?: (id: string) => Promise<boolean>;
  onDeleteHighlight?: (id: string) => Promise<boolean>;
};

export default function NotesPanel({
  notes,
  highlights = [],
  showHighlights = true,
  onClose,
  onNavigateToNote,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onDeleteHighlight,
}: NotesPanelProps) {
  const [activeTab, setActiveTab] = useState<"notes" | "highlights">("notes");
  const [isCreating, setIsCreating] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState("");

  const handleCreateNote = useCallback(async () => {
    if (!newNoteBody.trim() || !onCreateNote) return;

    await onCreateNote({ body: newNoteBody.trim() });
    setNewNoteBody("");
    setIsCreating(false);
  }, [newNoteBody, onCreateNote]);

  const handleUpdateNote = useCallback(
    async (noteId: string) => {
      if (!editingNoteBody.trim() || !onUpdateNote) return;

      await onUpdateNote(noteId, { body: editingNoteBody.trim() });
      setEditingNoteId(null);
      setEditingNoteBody("");
    },
    [editingNoteBody, onUpdateNote]
  );

  const handleTogglePin = useCallback(
    async (note: NoteResponse) => {
      if (!onUpdateNote) return;
      await onUpdateNote(note.id, { isPinned: !note.isPinned });
    },
    [onUpdateNote]
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!onDeleteNote) return;
      await onDeleteNote(noteId);
    },
    [onDeleteNote]
  );

  const handleDeleteHighlight = useCallback(
    async (highlightId: string) => {
      if (!onDeleteHighlight) return;
      await onDeleteHighlight(highlightId);
    },
    [onDeleteHighlight]
  );

  const startEditing = (note: NoteResponse) => {
    setEditingNoteId(note.id);
    setEditingNoteBody(note.body);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-background border-l shadow-xl z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold">Annotations</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      {showHighlights ? (
        <div className="flex border-b">
          <button
            className={cn(
              "flex-1 py-2 text-sm font-medium transition-colors",
              activeTab === "notes"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("notes")}
          >
            <StickyNote className="h-4 w-4 inline mr-1" />
            Notes ({notes.length})
          </button>
          <button
            className={cn(
              "flex-1 py-2 text-sm font-medium transition-colors",
              activeTab === "highlights"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("highlights")}
          >
            <Highlighter className="h-4 w-4 inline mr-1" />
            Highlights ({highlights.length})
          </button>
        </div>
      ) : (
        <div className="border-b px-4 py-2">
          <span className="text-sm font-medium flex items-center gap-1">
            <StickyNote className="h-4 w-4" />
            Notes ({notes.length})
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === "notes" && (
          <>
            {/* Create note button */}
            {!isCreating && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreating(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Note
              </Button>
            )}

            {/* Create note form */}
            {isCreating && (
              <div className="p-3 border rounded-lg space-y-2">
                <Textarea
                  placeholder="Write your note..."
                  value={newNoteBody}
                  onChange={(e) => setNewNoteBody(e.target.value)}
                  className="min-h-[80px] text-sm"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsCreating(false);
                      setNewNoteBody("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateNote}
                    disabled={!newNoteBody.trim()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}

            {/* Notes list */}
            {notes.length === 0 && !isCreating ? (
              <div className="text-center text-muted-foreground py-8">
                <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notes yet</p>
                <p className="text-xs">Create a note or highlight text to add one</p>
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className={cn(
                    "p-3 border rounded-lg space-y-2 cursor-pointer hover:border-primary/50 transition-colors",
                    note.isPinned && "border-primary/30 bg-primary/5"
                  )}
                  onClick={() => {
                    if (!editingNoteId) onNavigateToNote?.(note);
                  }}
                >
                  {editingNoteId === note.id ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <Textarea
                        value={editingNoteBody}
                        onChange={(e) => setEditingNoteBody(e.target.value)}
                        className="min-h-[80px] text-sm"
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingNoteId(null);
                            setEditingNoteBody("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUpdateNote(note.id)}
                          disabled={!editingNoteBody.trim()}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap line-clamp-4">
                        {note.body}
                      </p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatDate(note.createdAt)}</span>
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleTogglePin(note)}
                          >
                            <Pin
                              className={cn(
                                "h-3 w-3",
                                note.isPinned && "fill-current text-primary"
                              )}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => startEditing(note)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteNote(note.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {activeTab === "highlights" && showHighlights && (
          <>
            {highlights.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Highlighter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No highlights yet</p>
                <p className="text-xs">Select text to create a highlight</p>
              </div>
            ) : (
              highlights.map((highlight) => (
                <div
                  key={highlight.id}
                  className="p-3 border rounded-lg space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                      style={{ backgroundColor: highlight.color || "#ffe066" }}
                    />
                    <p className="text-sm line-clamp-3">{highlight.text}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatDate(highlight.createdAt)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteHighlight(highlight.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
