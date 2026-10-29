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
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  NoteResponse,
  HighlightResponse,
  CreateNoteDto,
  UpdateNoteDto,
  UpdateHighlightDto,
} from "@tools/reader/types";

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
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState("");

  // The callbacks (useNotes, useHighlights) report a failed request by resolving null/false
  // rather than throwing; each handler treats that as a failure, so an editor keeps its text.
  const handleCreateNote = useCallback(async () => {
    if (!newNoteBody.trim() || !onCreateNote) return;

    setIsSaving(true);
    try {
      const note = await onCreateNote({ body: newNoteBody.trim() });
      if (!note) throw new Error("Failed to create note");
      setNewNoteBody("");
      setIsCreating(false);
      toast.success("Note created");
    } catch {
      toast.error("Failed to create note");
    } finally {
      setIsSaving(false);
    }
  }, [newNoteBody, onCreateNote]);

  const handleUpdateNote = useCallback(
    async (noteId: string) => {
      if (!editingNoteBody.trim() || !onUpdateNote) return;

      setIsUpdating(true);
      try {
        const updated = await onUpdateNote(noteId, { body: editingNoteBody.trim() });
        if (!updated) throw new Error("Failed to update note");
        setEditingNoteId(null);
        setEditingNoteBody("");
        toast.success("Note updated");
      } catch {
        toast.error("Failed to update note");
      } finally {
        setIsUpdating(false);
      }
    },
    [editingNoteBody, onUpdateNote]
  );

  const handleTogglePin = useCallback(
    async (note: NoteResponse) => {
      if (!onUpdateNote) return;
      setTogglingPinId(note.id);
      try {
        const updated = await onUpdateNote(note.id, { isPinned: !note.isPinned });
        if (!updated) throw new Error("Failed to update pin status");
        toast.success(note.isPinned ? "Note unpinned" : "Note pinned");
      } catch {
        toast.error("Failed to update pin status");
      } finally {
        setTogglingPinId(null);
      }
    },
    [onUpdateNote]
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!onDeleteNote) return;
      setDeletingId(noteId);
      try {
        const deleted = await onDeleteNote(noteId);
        if (!deleted) throw new Error("Failed to delete note");
        toast.success("Note deleted");
      } catch {
        toast.error("Failed to delete note");
      } finally {
        setDeletingId(null);
      }
    },
    [onDeleteNote]
  );

  const handleDeleteHighlight = useCallback(
    async (highlightId: string) => {
      if (!onDeleteHighlight) return;
      setDeletingId(highlightId);
      try {
        const deleted = await onDeleteHighlight(highlightId);
        if (!deleted) throw new Error("Failed to delete highlight");
        toast.success("Highlight deleted");
      } catch {
        toast.error("Failed to delete highlight");
      } finally {
        setDeletingId(null);
      }
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
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateNote}
                    disabled={!newNoteBody.trim() || isSaving}
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
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
                          disabled={isUpdating}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUpdateNote(note.id)}
                          disabled={!editingNoteBody.trim() || isUpdating}
                        >
                          {isUpdating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
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
                            disabled={togglingPinId === note.id}
                          >
                            {togglingPinId === note.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Pin
                                className={cn(
                                  "h-3 w-3",
                                  note.isPinned && "fill-current text-primary"
                                )}
                              />
                            )}
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
                            disabled={deletingId === note.id}
                          >
                            {deletingId === note.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
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
                      disabled={deletingId === highlight.id}
                    >
                      {deletingId === highlight.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
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
