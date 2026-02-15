"use client";

import { useState } from "react";
import Link from "next/link";
import { useSemanticGroups, useGroupEntries } from "@/hooks/useDictionary";
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
import { Loader2, Plus, Pencil, Trash2, X, Check, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { WordSearch } from "../components/WordSearch";
import type { SemanticGroupResponse, DictionarySearchResult } from "@/lib/types";

const PRESET_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#84CC16", // lime
];

function GroupCard({
  group,
  onUpdate,
  onDelete,
  onRefresh,
}: {
  group: SemanticGroupResponse;
  onUpdate: (id: string, data: { name?: string; description?: string; color?: string }) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || "");
  const [color, setColor] = useState(group.color || PRESET_COLORS[0]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null);
  const { entries, isLoading: entriesLoading, fetchEntries } = useGroupEntries(isExpanded ? group.id : null);

  const handleAddWord = async (entry: DictionarySearchResult) => {
    try {
      const response = await fetch(`/api/dictionary/entries/${entry.id}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groupIds: [group.id] }),
      });
      if (!response.ok) throw new Error("Failed to add word to group");
      toast.success(`Added "${entry.word}" to ${group.name}`);
      fetchEntries();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add word");
    }
  };

  const handleRemoveWord = async (entryId: string, word: string) => {
    setRemovingEntryId(entryId);
    try {
      const response = await fetch(`/api/dictionary/entries/${entryId}/groups/${group.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to remove word from group");
      toast.success(`Removed "${word}" from ${group.name}`);
      fetchEntries();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove word");
    } finally {
      setRemovingEntryId(null);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await onUpdate(group.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        color,
      });
      setIsEditing(false);
      toast.success("Group updated");
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
      toast.success("Group deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    setName(group.name);
    setDescription(group.description || "");
    setColor(group.color || PRESET_COLORS[0]);
    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: group.color || PRESET_COLORS[0] }}
            />
            {isEditing ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="font-semibold"
                autoFocus
              />
            ) : (
              <CardTitle className="text-lg truncate">{group.name}</CardTitle>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {isEditing ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                  <X className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving || !name.trim()}>
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
                      <AlertDialogTitle>Delete group?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete "{group.name}" and remove all word associations.
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
        {isEditing ? (
          <>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      color === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {group.description && (
              <p className="text-sm text-muted-foreground">{group.description}</p>
            )}
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
                <FolderOpen className="h-3 w-3 mr-1" />
                {isExpanded ? "Hide" : "Show"} words
              </Button>
            </div>
            {isExpanded && (
              <div className="pt-3 border-t space-y-3">
                {/* Add word search */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Add words to this group</Label>
                  <WordSearch
                    onSelect={handleAddWord}
                    selectedIds={entries.map((e) => e.id)}
                    placeholder="Search words to add..."
                  />
                </div>

                {/* Entries list */}
                {entriesLoading ? (
                  <div className="flex justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No words in this group yet. Search above to add words.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-1 text-sm px-2 py-1 bg-muted rounded-md group"
                      >
                        <Link
                          href={`/dictionary/${entry.id}`}
                          className="hover:underline"
                        >
                          {entry.word}
                        </Link>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CreateGroupForm({ onCreate }: { onCreate: (data: { name: string; description?: string; color?: string }) => Promise<unknown> }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
      });
      setName("");
      setDescription("");
      setColor(PRESET_COLORS[0]);
      setIsOpen(false);
      toast.success("Group created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} className="w-full sm:w-auto">
        <Plus className="h-4 w-4 mr-2" />
        New Group
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Emotions, Cooking verbs..."
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    color === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating || !name.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Group"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function GroupsPage() {
  const { groups, isLoading, createGroup, updateGroup, deleteGroup, fetchGroups } = useSemanticGroups();

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
          <h1 className="text-2xl font-semibold">Word Groups</h1>
          <p className="text-sm text-muted-foreground">
            Organize words into semantic groups to find related words easily
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <CreateGroupForm onCreate={createGroup} />

        {groups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-2">No groups yet</p>
            <p className="text-sm text-muted-foreground">
              Create groups like "Emotions", "Food", or "Travel" to organize your vocabulary
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <GroupCard
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
