"use client";

import { useState } from "react";
import Link from "next/link";
import { useEntrySynonyms, useSynonymGroups, useDictionarySearch } from "@/hooks/useDictionary";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Link2, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { WordSearch } from "./WordSearch";
import type { DictionarySearchResult } from "@/lib/types";

interface SynonymSelectorProps {
  entryId: string;
  currentWord: string;
}

export function SynonymSelector({ entryId, currentWord }: SynonymSelectorProps) {
  const { synonyms, synonymGroups, isLoading, fetchSynonyms } = useEntrySynonyms(entryId);
  const { createGroup } = useSynonymGroups();
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<DictionarySearchResult[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleSelectEntry = (entry: DictionarySearchResult) => {
    if (!selectedEntries.find((e) => e.id === entry.id)) {
      setSelectedEntries((prev) => [...prev, entry]);
    }
  };

  const handleRemoveEntry = (id: string) => {
    setSelectedEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleLinkSynonyms = async () => {
    if (selectedEntries.length === 0) return;

    setIsCreating(true);
    try {
      // Include current entry + selected entries
      const entryIds = [entryId, ...selectedEntries.map((e) => e.id)];
      await createGroup({ entryIds });
      toast.success("Words linked as synonyms");
      setSelectedEntries([]);
      setIsAddingMode(false);
      fetchSynonyms();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link synonyms");
    } finally {
      setIsCreating(false);
    }
  };

  const allSelectedIds = [entryId, ...synonyms.map((s) => s.id), ...selectedEntries.map((e) => e.id)];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Synonyms
        </Label>
        {synonyms.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 px-2 text-xs"
          >
            {isExpanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          {/* Display existing synonyms */}
          {synonyms.length > 0 && isExpanded && (
            <div className="flex flex-wrap gap-2">
              {synonyms.map((synonym) => (
                <Link
                  key={synonym.id}
                  href={`/dictionary/${synonym.id}`}
                  className="flex items-center gap-1.5 text-sm px-2.5 py-1 bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
                >
                  <span className="font-medium">{synonym.word}</span>
                  {synonym.partOfSpeech && (
                    <span className="text-xs text-muted-foreground">
                      ({synonym.partOfSpeech})
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}

          {/* Synonym groups info */}
          {synonymGroups.length > 0 && isExpanded && (
            <div className="text-xs text-muted-foreground">
              In {synonymGroups.length} synonym {synonymGroups.length === 1 ? "group" : "groups"}
              {synonymGroups.some((g) => g.name) && (
                <span>
                  : {synonymGroups.filter((g) => g.name).map((g) => g.name).join(", ")}
                </span>
              )}
            </div>
          )}

          {/* Add mode */}
          {isAddingMode ? (
            <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
              <div className="space-y-2">
                <Label className="text-xs">
                  Link "{currentWord}" with other words as synonyms
                </Label>
                <WordSearch
                  onSelect={handleSelectEntry}
                  selectedIds={allSelectedIds}
                  placeholder="Search words to link..."
                />
              </div>

              {/* Selected entries to link */}
              {selectedEntries.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-1 text-sm px-2 py-1 bg-primary/10 rounded-md"
                    >
                      <span className="font-medium">{entry.word}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(entry.id)}
                        className="hover:bg-black/10 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsAddingMode(false);
                    setSelectedEntries([]);
                  }}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleLinkSynonyms}
                  disabled={isCreating || selectedEntries.length === 0}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-1" />
                      Link as Synonyms
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddingMode(true)}
              className="text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              {synonyms.length > 0 ? "Add more synonyms" : "Link synonyms"}
            </Button>
          )}

          {/* Link to synonyms page */}
          {synonyms.length > 0 && (
            <Link
              href="/dictionary/synonyms"
              className="text-xs text-primary hover:underline"
            >
              Manage synonym groups
            </Link>
          )}
        </>
      )}
    </div>
  );
}
