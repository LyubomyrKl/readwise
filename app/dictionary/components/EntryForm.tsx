"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { CollocationListInput } from "./CollocationInput";
import { useDictionaryEntries, useCreateCards } from "@/hooks/useDictionary";
import type { CreateDictionaryEntryDto, CreateCollocationDto } from "@/lib/types";

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

export function EntryForm() {
  const router = useRouter();
  const { createEntry } = useDictionaryEntries();
  const { createCards, isCreating: isCreatingCards } = useCreateCards();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [collocations, setCollocations] = useState<CreateCollocationDto[]>([]);
  const [createCardsAfter, setCreateCardsAfter] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.word.trim()) {
      setError("Word is required");
      return;
    }
    if (!formData.definition.trim()) {
      setError("Definition is required");
      return;
    }
    if (!formData.personalExample.trim()) {
      setError("Your own example sentence is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: CreateDictionaryEntryDto = {
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
        collocations: collocations.length > 0 ? collocations : undefined,
      };

      const entry = await createEntry(dto);
      toast.success(`"${entry.word}" added to dictionary`);

      // Optionally create cards
      if (createCardsAfter) {
        await createCards(entry.id);
        toast.success("Learning cards created");
      }

      router.push("/dictionary");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create entry";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    formData.word.trim() &&
    formData.definition.trim() &&
    formData.personalExample.trim();

  return (
    <div className="max-w-2xl mx-auto">
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
          <CardTitle>Add New Word</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Word and Part of Speech */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="word">
                  Word <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="word"
                  name="word"
                  placeholder="e.g., desarrollar"
                  value={formData.word}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partOfSpeech">Part of Speech</Label>
                <Select
                  value={formData.partOfSpeech}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, partOfSpeech: value }))
                  }
                >
                  <SelectTrigger className='w-full'>
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
              </div>
            </div>

            {/* Pronunciation */}
            <div className="space-y-2">
              <Label htmlFor="pronunciation">Pronunciation (IPA)</Label>
              <Input
                id="pronunciation"
                name="pronunciation"
                placeholder="e.g., /de.sa.ro.ˈʎaɾ/"
                value={formData.pronunciation}
                onChange={handleChange}
              />
            </div>

            {/* Definition */}
            <div className="space-y-2">
              <Label htmlFor="definition">
                Definition <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="definition"
                name="definition"
                placeholder="Write in your own words. Avoid copy-pasting."
                value={formData.definition}
                onChange={handleChange}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Write in your own words. Avoid copy-pasting from dictionaries.
              </p>
            </div>

            {/* Nuance */}
            <div className="space-y-2">
              <Label htmlFor="nuance">Nuance (register, connotation, usage notes)</Label>
              <Textarea
                id="nuance"
                name="nuance"
                placeholder="e.g., More formal than 'crecer'. Often used for skills, projects..."
                value={formData.nuance}
                onChange={handleChange}
                rows={2}
              />
            </div>

            {/* Personal Example - Emphasized */}
            <div className="space-y-2 p-4 border-2 border-primary/30 rounded-lg bg-primary/5">
              <Label htmlFor="personalExample" className="text-base font-semibold">
                YOUR SENTENCE <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="personalExample"
                name="personalExample"
                placeholder="Write your own example sentence using this word..."
                value={formData.personalExample}
                onChange={handleChange}
                rows={3}
                className="text-base"
              />
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Writing your own example activates the Generation Effect - you'll
                  remember this word 40% better than if you just read someone else's
                  example.
                </span>
              </div>
            </div>

            {/* Source Context */}
            <div className="space-y-2">
              <Label htmlFor="sourceContext">Where did you encounter this word?</Label>
              <Input
                id="sourceContext"
                name="sourceContext"
                placeholder="e.g., News article about Spanish economy"
                value={formData.sourceContext}
                onChange={handleChange}
              />
            </div>

            {/* Collocations */}
            <CollocationListInput
              collocations={collocations}
              onChange={setCollocations}
            />

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                name="tags"
                placeholder="e.g., economics, formal, verbs (comma-separated)"
                value={formData.tags}
                onChange={handleChange}
              />
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit */}
            <div className="flex flex-col gap-3 pt-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="createCardsAfter"
                  checked={createCardsAfter}
                  onChange={(e) => setCreateCardsAfter(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="createCardsAfter" className="text-sm font-normal cursor-pointer">
                  Create learning cards immediately after saving
                </Label>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/dictionary")}
                  disabled={isSubmitting || isCreatingCards}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting || isCreatingCards || !isFormValid}
                >
                  {isSubmitting || isCreatingCards ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isCreatingCards ? "Creating Cards..." : createCardsAfter ? "Saving & Creating Cards..." : "Saving..."}
                    </>
                  ) : createCardsAfter ? (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Save & Create Cards
                    </>
                  ) : (
                    "Save Entry"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
