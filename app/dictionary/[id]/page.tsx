"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Loader2, ArrowLeft, Trash2, Save, Pencil, X } from "lucide-react";
import {
  useDictionaryEntry,
  useDictionaryEntries,
  useCollocations,
} from "@/hooks/useDictionary";
import { MasteryBadge, AgingWarning } from "../components/MasteryBadge";
import { CreateCardsButton } from "../components/CreateCardsButton";
import { CollocationInput } from "../components/CollocationInput";
import { toast } from "sonner";
import type { UpdateDictionaryEntryDto } from "@/lib/types";

const partsOfSpeech = [
  { value: "noun", label: "Noun" },
  { value: "verb", label: "Verb" },
  { value: "adj", label: "Adjective" },
  { value: "adv", label: "Adverb" },
  { value: "prep", label: "Preposition" },
  { value: "conj", label: "Conjunction" },
  { value: "pron", label: "Pronoun" },
  { value: "interj", label: "Interjection" },
  { value: "phrase", label: "Phrase" },
  { value: "idiom", label: "Idiom" },
];

export default function EntryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const entryId = params.id as string;

  const { entry, isLoading, error, refetch, setEntry } = useDictionaryEntry(entryId);
  const { updateEntry, deleteEntry } = useDictionaryEntries();
  const { addCollocation, removeCollocation, isAdding, isRemoving } =
    useCollocations(entryId);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formData, setFormData] = useState({
    word: "",
    partOfSpeech: "",
    pronunciation: "",
    definition: "",
    nuance: "",
    personalExample: "",
    sourceContext: "",
    tags: "",
  });

  // Initialize form data when entry loads
  useEffect(() => {
    if (entry) {
      setFormData({
        word: entry.word,
        partOfSpeech: entry.partOfSpeech || "",
        pronunciation: entry.pronunciation || "",
        definition: entry.definition,
        nuance: entry.nuance || "",
        personalExample: entry.personalExample,
        sourceContext: entry.sourceContext || "",
        tags: entry.tags.join(", "),
      });
    }
  }, [entry]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!entry) return;

    setIsSaving(true);
    try {
      const dto: UpdateDictionaryEntryDto = {
        word: formData.word.trim(),
        partOfSpeech: formData.partOfSpeech || undefined,
        pronunciation: formData.pronunciation.trim() || undefined,
        definition: formData.definition.trim(),
        nuance: formData.nuance.trim() || undefined,
        personalExample: formData.personalExample.trim(),
        sourceContext: formData.sourceContext.trim() || undefined,
        tags: formData.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };

      const updated = await updateEntry(entryId, dto);
      setEntry(updated);
      setIsEditing(false);
      toast.success("Entry updated", {
        description: "Your changes have been saved.",
      });
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteEntry(entryId);
      toast.success("Entry deleted", {
        description: "The dictionary entry has been removed.",
      });
      router.push("/dictionary");
    } catch (err) {
      toast.error("Failed to delete", {
        description: err instanceof Error ? err.message : "An error occurred",
      });
      setIsDeleting(false);
    }
  };

  const handleAddCollocation = async (dto: any) => {
    const result = await addCollocation(dto);
    if (entry) {
      setEntry({
        ...entry,
        collocations: [...entry.collocations, result],
      });
    }
    return result;
  };

  const handleRemoveCollocation = async (collocationId: string) => {
    await removeCollocation(collocationId);
    if (entry) {
      setEntry({
        ...entry,
        collocations: entry.collocations.filter((c) => c.id !== collocationId),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            {error || "Entry not found"}
          </p>
          <Link href="/dictionary">
            <Button variant="outline">Back to Dictionary</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/dictionary"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dictionary
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {isEditing ? (
                <Input
                  name="word"
                  value={formData.word}
                  onChange={handleChange}
                  className="text-2xl font-bold h-auto py-1 px-2 w-auto"
                />
              ) : (
                <CardTitle className="text-2xl">{entry.word}</CardTitle>
              )}
              <MasteryBadge level={entry.masteryLevel} showLabel />
              <AgingWarning
                createdAt={entry.createdAt}
                masteryLevel={entry.masteryLevel}
              />
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditing(false);
                      // Reset form data
                      setFormData({
                        word: entry.word,
                        partOfSpeech: entry.partOfSpeech || "",
                        pronunciation: entry.pronunciation || "",
                        definition: entry.definition,
                        nuance: entry.nuance || "",
                        personalExample: entry.personalExample,
                        sourceContext: entry.sourceContext || "",
                        tags: entry.tags.join(", "),
                      });
                    }}
                    disabled={isSaving}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-1" />
                        Save
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete "{entry.word}" from your
                          dictionary. Any linked learning cards will remain but
                          will no longer be connected to this entry.
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

        <CardContent className="space-y-6">
          {/* Part of Speech & Pronunciation */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Part of Speech
              </Label>
              {isEditing ? (
                <Select
                  value={formData.partOfSpeech}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, partOfSpeech: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {partsOfSpeech.map((pos) => (
                      <SelectItem key={pos.value} value={pos.value}>
                        {pos.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="font-medium">
                  {entry.partOfSpeech || <span className="text-muted-foreground">-</span>}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Pronunciation
              </Label>
              {isEditing ? (
                <Input
                  name="pronunciation"
                  value={formData.pronunciation}
                  onChange={handleChange}
                  placeholder="IPA notation"
                />
              ) : (
                <p className="font-medium font-mono">
                  {entry.pronunciation || <span className="text-muted-foreground">-</span>}
                </p>
              )}
            </div>
          </div>

          {/* Definition */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Definition</Label>
            {isEditing ? (
              <Textarea
                name="definition"
                value={formData.definition}
                onChange={handleChange}
                rows={2}
              />
            ) : (
              <p className="font-medium">{entry.definition}</p>
            )}
          </div>

          {/* Nuance */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Nuance</Label>
            {isEditing ? (
              <Textarea
                name="nuance"
                value={formData.nuance}
                onChange={handleChange}
                rows={2}
                placeholder="Usage notes, register, connotation..."
              />
            ) : (
              <p>
                {entry.nuance || <span className="text-muted-foreground">-</span>}
              </p>
            )}
          </div>

          {/* Personal Example */}
          <div className="space-y-2 p-4 bg-primary/5 rounded-lg">
            <Label className="text-sm font-semibold">Your Example</Label>
            {isEditing ? (
              <Textarea
                name="personalExample"
                value={formData.personalExample}
                onChange={handleChange}
                rows={3}
              />
            ) : (
              <p className="italic text-lg">"{entry.personalExample}"</p>
            )}
          </div>

          {/* Source Context */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Source</Label>
            {isEditing ? (
              <Input
                name="sourceContext"
                value={formData.sourceContext}
                onChange={handleChange}
                placeholder="Where did you encounter this word?"
              />
            ) : (
              <p>
                {entry.sourceContext || (
                  <span className="text-muted-foreground">-</span>
                )}
              </p>
            )}
          </div>

          {/* Collocations */}
          <CollocationInput
            collocations={entry.collocations}
            onAdd={handleAddCollocation}
            onRemove={handleRemoveCollocation}
            isAdding={isAdding}
            removingId={isRemoving}
          />

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Tags</Label>
            {isEditing ? (
              <Input
                name="tags"
                value={formData.tags}
                onChange={handleChange}
                placeholder="Comma-separated tags"
              />
            ) : entry.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-sm px-2 py-1 bg-muted rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">-</p>
            )}
          </div>

          {/* Cards section */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-muted-foreground">
                  Learning Cards
                </Label>
                <p className="text-sm">
                  {entry.cardsCount === 0
                    ? "No cards created yet"
                    : `${entry.cardsCount} card${entry.cardsCount !== 1 ? "s" : ""} linked`}
                </p>
              </div>
              <CreateCardsButton
                entryId={entry.id}
                hasCards={entry.cardsCount > 0}
                onSuccess={refetch}
              />
            </div>
          </div>

          {/* Metadata */}
          <div className="pt-4 border-t text-xs text-muted-foreground">
            <p>Created: {new Date(entry.createdAt).toLocaleDateString()}</p>
            <p>Updated: {new Date(entry.updatedAt).toLocaleDateString()}</p>
            {entry.lastReviewed && (
              <p>
                Last reviewed: {new Date(entry.lastReviewed).toLocaleDateString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
