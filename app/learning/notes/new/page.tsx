"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLearningNotes, useDebounce } from "@/hooks/useLearning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewNotePage() {
  const router = useRouter();
  const { createNote, validateNote } = useLearningNotes();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    targetSentence: "",
    meaning: "",
    targetWord: "",
    notes: "",
    alternativePhrasing: "",
  });
  const [validation, setValidation] = useState<{
    isValid: boolean;
    warnings: string[];
    errors: string[];
  } | null>(null);

  // Memoize form values to prevent object reference changes on each render
  const formDataForValidation = useMemo(
    () => ({
      targetSentence: formData.targetSentence,
      meaning: formData.meaning,
      targetWord: formData.targetWord,
    }),
    [formData.targetSentence, formData.meaning, formData.targetWord]
  );

  // Debounce form values for validation
  const debouncedData = useDebounce(formDataForValidation, 500);

  // Live validation
  useEffect(() => {
    const { targetSentence, meaning, targetWord } = debouncedData;
    if (targetSentence && meaning && targetWord) {
      validateNote({ targetSentence, meaning, targetWord })
        .then(setValidation)
        .catch(() => setValidation(null));
    } else {
      setValidation(null);
    }
  }, [debouncedData, validateNote]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (validation?.errors?.length) {
      return;
    }

    setIsSubmitting(true);
    try {
      await createNote({
        targetSentence: formData.targetSentence,
        meaning: formData.meaning,
        targetWord: formData.targetWord,
        notes: formData.notes || undefined,
        alternativePhrasing: formData.alternativePhrasing || undefined,
      });
      router.push("/learning/notes");
    } catch (error) {
      console.error("Failed to create note:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    formData.targetSentence.trim() &&
    formData.meaning.trim() &&
    formData.targetWord.trim() &&
    (!validation || validation.isValid);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/learning/notes"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Notes
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Learning Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Target Sentence */}
            <div className="space-y-2">
              <Label htmlFor="targetSentence">
                Target Sentence (L2) <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="targetSentence"
                name="targetSentence"
                placeholder="Enter a complete sentence in the language you're learning..."
                value={formData.targetSentence}
                onChange={handleChange}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Use a complete sentence, not just a word or phrase.
              </p>
            </div>

            {/* Meaning */}
            <div className="space-y-2">
              <Label htmlFor="meaning">
                Meaning (L1) <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="meaning"
                name="meaning"
                placeholder="Translation in your native language..."
                value={formData.meaning}
                onChange={handleChange}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Provide a natural translation, not a dictionary definition.
              </p>
            </div>

            {/* Target Word */}
            <div className="space-y-2">
              <Label htmlFor="targetWord">
                Target Word/Grammar <span className="text-red-500">*</span>
              </Label>
              <Input
                id="targetWord"
                name="targetWord"
                placeholder="The specific word or grammar point to focus on..."
                value={formData.targetWord}
                onChange={handleChange}
              />
            </div>

            {/* Optional fields */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Additional context, mnemonics, or explanations..."
                value={formData.notes}
                onChange={handleChange}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="alternativePhrasing">
                Alternative Phrasing (optional)
              </Label>
              <Input
                id="alternativePhrasing"
                name="alternativePhrasing"
                placeholder="Other ways to express the same meaning..."
                value={formData.alternativePhrasing}
                onChange={handleChange}
              />
            </div>

            {/* Validation Feedback */}
            {validation?.errors?.length ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 space-y-1">
                    {validation.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            {validation?.warnings?.length ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc pl-4 space-y-1">
                    {validation.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !isFormValid}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Note & Generate Cards"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
