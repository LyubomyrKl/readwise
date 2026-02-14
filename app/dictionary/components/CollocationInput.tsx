"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus, Loader2 } from "lucide-react";
import type { CreateCollocationDto, CollocationResponse } from "@/lib/types";

interface CollocationInputProps {
  collocations: CollocationResponse[];
  onAdd: (collocation: CreateCollocationDto) => Promise<CollocationResponse>;
  onRemove: (collocationId: string) => Promise<void>;
  isAdding?: boolean;
  removingId?: string | null;
}

export function CollocationInput({
  collocations,
  onAdd,
  onRemove,
  isAdding = false,
  removingId = null,
}: CollocationInputProps) {
  const [showForm, setShowForm] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [translation, setTranslation] = useState("");
  const [example, setExample] = useState("");

  const handleAdd = async () => {
    if (!phrase.trim()) return;

    try {
      await onAdd({
        phrase: phrase.trim(),
        translation: translation.trim() || undefined,
        example: example.trim() || undefined,
      });
      setPhrase("");
      setTranslation("");
      setExample("");
      setShowForm(false);
    } catch (error) {
      // Error handled by parent
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Collocations</Label>
        {!showForm && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        )}
      </div>

      {/* Existing collocations */}
      {collocations.length > 0 && (
        <div className="space-y-2">
          {collocations.map((collocation) => (
            <div
              key={collocation.id}
              className="flex items-center gap-2 p-2 bg-muted/50 rounded-md"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {collocation.phrase}
                </div>
                {collocation.translation && (
                  <div className="text-xs text-muted-foreground truncate">
                    {collocation.translation}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(collocation.id)}
                disabled={removingId === collocation.id}
              >
                {removingId === collocation.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="collocation-phrase" className="text-xs">
              Phrase *
            </Label>
            <Input
              id="collocation-phrase"
              placeholder="e.g., hacer caso"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collocation-translation" className="text-xs">
              Translation
            </Label>
            <Input
              id="collocation-translation"
              placeholder="e.g., to pay attention"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collocation-example" className="text-xs">
              Example
            </Label>
            <Input
              id="collocation-example"
              placeholder="Example sentence..."
              value={example}
              onChange={(e) => setExample(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!phrase.trim() || isAdding}
            >
              {isAdding ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setPhrase("");
                setTranslation("");
                setExample("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {collocations.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground">
          No collocations yet. Add common phrases that use this word.
        </p>
      )}
    </div>
  );
}

// Simple collocation list for new entry form (before entry is created)
interface CollocationListInputProps {
  collocations: CreateCollocationDto[];
  onChange: (collocations: CreateCollocationDto[]) => void;
}

export function CollocationListInput({
  collocations,
  onChange,
}: CollocationListInputProps) {
  const [showForm, setShowForm] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [translation, setTranslation] = useState("");

  const handleAdd = () => {
    if (!phrase.trim()) return;
    onChange([
      ...collocations,
      {
        phrase: phrase.trim(),
        translation: translation.trim() || undefined,
      },
    ]);
    setPhrase("");
    setTranslation("");
    setShowForm(false);
  };

  const handleRemove = (index: number) => {
    onChange(collocations.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Collocations</Label>
        {!showForm && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        )}
      </div>

      {collocations.length > 0 && (
        <div className="space-y-2">
          {collocations.map((collocation, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-muted/50 rounded-md"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {collocation.phrase}
                </div>
                {collocation.translation && (
                  <div className="text-xs text-muted-foreground truncate">
                    {collocation.translation}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="new-collocation-phrase" className="text-xs">
                Phrase *
              </Label>
              <Input
                id="new-collocation-phrase"
                placeholder="e.g., hacer caso"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-collocation-translation" className="text-xs">
                Translation
              </Label>
              <Input
                id="new-collocation-translation"
                placeholder="e.g., pay attention"
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!phrase.trim()}
            >
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setPhrase("");
                setTranslation("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
