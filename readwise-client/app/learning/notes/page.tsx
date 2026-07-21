"use client";

import { useLearningNotes } from "@/hooks/useLearning";
import { NoteCard } from "./(components)/NoteCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";

export default function NotesPage() {
  const { notes, isLoading, deleteNote } = useLearningNotes();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const query = searchQuery.toLowerCase();
    return notes.filter(
      (note) =>
        note.targetSentence.toLowerCase().includes(query) ||
        note.meaning.toLowerCase().includes(query) ||
        note.targetWord.toLowerCase().includes(query)
    );
  }, [notes, searchQuery]);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this note?")) {
      await deleteNote(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Learning Notes</h1>
          <p className="text-muted-foreground">
            {notes.length} notes total
          </p>
        </div>
        <Link href="/learning/notes/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Note
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            {notes.length === 0
              ? "No notes yet. Create your first note to start learning!"
              : "No notes match your search."}
          </p>
          {notes.length === 0 && (
            <Link href="/learning/notes/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create First Note
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotes.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
