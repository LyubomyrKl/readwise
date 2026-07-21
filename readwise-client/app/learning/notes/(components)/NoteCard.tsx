"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, BookOpen, Archive } from "lucide-react";
import type { LearningNoteResponse } from "@/lib/types";

interface NoteCardProps {
  note: LearningNoteResponse;
  onDelete: (id: string) => void;
}

const SOURCE_TYPE_LABELS = {
  manual: "Manual",
  highlight: "From Highlight",
  ai_generated: "AI Generated",
};

export function NoteCard({ note, onDelete }: NoteCardProps) {
  const activeCards = note.cards.filter((c) => c.state !== "new");
  const newCards = note.cards.filter((c) => c.state === "new");

  return (
    <Card className={note.isArchived ? "opacity-60" : ""}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Target Sentence */}
            <p className="font-medium text-lg mb-1 truncate">
              {note.targetSentence}
            </p>

            {/* Meaning */}
            <p className="text-muted-foreground mb-2 truncate">{note.meaning}</p>

            {/* Target Word */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{note.targetWord}</Badge>
              <span className="text-xs text-muted-foreground">
                {SOURCE_TYPE_LABELS[note.sourceType]}
              </span>
              {note.isArchived && (
                <Badge variant="outline" className="text-xs">
                  <Archive className="h-3 w-3 mr-1" />
                  Archived
                </Badge>
              )}
            </div>

            {/* Card Stats */}
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                {note.cards.length} cards ({newCards.length} new,{" "}
                {activeCards.length} learning)
              </span>
              <span>
                Created {new Date(note.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <BookOpen className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(note.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
