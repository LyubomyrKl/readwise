"use client";

import { useState } from "react";
import Link from "next/link";
import { useSynonymGroups, useSynonymGroup, useDictionarySearch } from "@/hooks/useDictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Pencil, Trash2, X, Check, Link2, Search } from "lucide-react";
import { toast } from "sonner";
import { WordSearch } from "../components/WordSearch";
import type { SynonymGroupSummaryResponse, DictionarySearchResult } from "@/lib/types";

function SynonymGroupCard({
  group,
  onUpdate,
  onDelete,
  onRefresh,
}: {
  group: SynonymGroupSummaryResponse;
  onUpdate: (id: string, data: { name?: string }) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(group.name || "");
  const [isExpanded, setIsExpanded] = useState(false);
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null);
  const { group: fullGroup, isLoading: groupLoading, addEntries, removeEntry, fetchGroup } = useSynonymGroup(isExpanded ? group.id : null);

  const handleAddWord = async (entry: DictionarySearchResult) => {
    try {
      await addEntries([entry.id]);
      toast.success(`Added "${entry.word}" as synonym`);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add word");
    }
  };

  const handleRemoveWord = async (entryId: string, word: string) => {
    setRemovingEntryId(entryId);
    try {
      const result = await removeEntry(entryId);
      if (result === null) {
        toast.success(`Removed "${word}" - group deleted (less than 2 words)`);
        onRefresh();
      } else {
        toast.success(`Removed "${word}" from synonyms`);
        onRefresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove word");
    } finally {
      setRemovingEntryId(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(group.id, { name: name.trim() || undefined });
      setIsEditing(false);
      toast.success("Synonym group updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(group.id);
      toast.success("Synonym group deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    setName(group.name || "");
    setIsEditing(false);
  };

  const entries = fullGroup?.entries || [];
  const selectedIds = entries.map((e) => e.id);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link2 className="w-4 h-4 text-primary flex-shrink-0" />
            {isEditing ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group name (optional)"
                className="font-semibold"
                autoFocus
              />
            ) : (
              <CardTitle className="text-lg truncate">
                {group.name || (
                  <span className="text-muted-foreground italic">Unnamed group</span>
                )}
              </CardTitle>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {isEditing ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                  <X className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete synonym group?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete the synonym links between these words.
                        The words themselves will not be deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {group.entryCount} {group.entryCount === 1 ? "word" : "words"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs"
          >
            <Link2 className="h-3 w-3 mr-1" />
            {isExpanded ? "Hide" : "Show"} words
          </Button>
        </div>

        {isExpanded && (
          <div className="pt-3 border-t space-y-3">
            {/* Add word search */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Add words as synonyms</Label>
              <WordSearch
                onSelect={handleAddWord}
                selectedIds={selectedIds}
                placeholder="Search words to add..."
              />
            </div>

            {/* Entries list */}
            {groupLoading ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                No words in this group.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-1 text-sm px-2 py-1 bg-primary/10 rounded-md group"
                  >
                    <Link
                      href={`/dictionary/${entry.id}`}
                      className="hover:underline font-medium"
                    >
                      {entry.word}
                    </Link>
                    {entry.partOfSpeech && (
                      <span className="text-xs text-muted-foreground">
                        ({entry.partOfSpeech})
                      </span>
                    )}
                    <button
                      onClick={() => handleRemoveWord(entry.id, entry.word)}
                      disabled={removingEntryId === entry.id}
                      className="opacity-0 group-hover:opacity-100 ml-0.5 hover:bg-black/10 rounded-full p-0.5 transition-all"
                    >
                      {removingEntryId === entry.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateSynonymGroupForm({ onCreate, onRefresh }: {
  onCreate: (data: { entryIds: string[]; name?: string }) => Promise<unknown>;
  onRefresh: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedEntries, setSelectedEntries] = useState<DictionarySearchResult[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const handleSelectEntry = (entry: DictionarySearchResult) => {
    if (!selectedEntries.find((e) => e.id === entry.id)) {
      setSelectedEntries((prev) => [...prev, entry]);
    }
  };

  const handleRemoveEntry = (entryId: string) => {
    setSelectedEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEntries.length < 2) {
      toast.error("Select at least 2 words to link as synonyms");
      return;
    }

    setIsCreating(true);
    try {
      await onCreate({
        entryIds: selectedEntries.map((e) => e.id),
        name: name.trim() || undefined,
      });
      setName("");
      setSelectedEntries([]);
      setIsOpen(false);
      toast.success("Synonym group created");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create synonym group");
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} className="w-full sm:w-auto">
        <Plus className="h-4 w-4 mr-2" />
        Link Words as Synonyms
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name (optional)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Happy words, Big things..."
            />
          </div>

          <div className="space-y-2">
            <Label>
              Select Words <span className="text-red-500">*</span>
              <span className="text-xs text-muted-foreground ml-2">(minimum 2)</span>
            </Label>
            <WordSearch
              onSelect={handleSelectEntry}
              selectedIds={selectedEntries.map((e) => e.id)}
              placeholder="Search words to link..."
            />

            {/* Selected entries */}
            {selectedEntries.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
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
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsOpen(false);
                setSelectedEntries([]);
                setName("");
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating || selectedEntries.length < 2}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Link as Synonyms"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SynonymsPage() {
  const { groups, isLoading, createGroup, updateGroup, deleteGroup, fetchGroups } = useSynonymGroups();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Synonym Groups</h1>
          <p className="text-sm text-muted-foreground">
            Link words together as synonyms to see them when studying
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <CreateSynonymGroupForm onCreate={createGroup} onRefresh={fetchGroups} />

        {groups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">No synonym groups yet</p>
            <p className="text-sm text-muted-foreground">
              Link words like "happy", "joyful", "glad" together to see them as synonyms
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <SynonymGroupCard
              key={group.id}
              group={group}
              onUpdate={updateGroup}
              onDelete={deleteGroup}
              onRefresh={fetchGroups}
            />
          ))
        )}
      </div>
    </div>
  );
}
