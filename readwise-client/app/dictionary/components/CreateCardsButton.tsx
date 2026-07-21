"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { useCreateCards } from "@/hooks/useDictionary";
import { toast } from "sonner";

interface CreateCardsButtonProps {
  entryId: string;
  hasCards: boolean;
  onSuccess?: () => void;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}

export function CreateCardsButton({
  entryId,
  hasCards,
  onSuccess,
  variant = "default",
  size = "default",
}: CreateCardsButtonProps) {
  const { createCards, isCreating } = useCreateCards();

  const handleClick = async () => {
    try {
      await createCards(entryId);
      toast.success("Cards created", {
        description: "Learning cards have been generated from this entry.",
      });
      onSuccess?.();
    } catch (error) {
      toast.error("Failed to create cards", {
        description: error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isCreating}
      variant={variant}
      size={size}
    >
      {isCreating ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Creating...
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 mr-2" />
          {hasCards ? "Create More Cards" : "Create Cards"}
        </>
      )}
    </Button>
  );
}
