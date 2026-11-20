"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { moneyApi } from "../api";
import { title } from "../lib/describe";
import { errorMessage, moneyKeys } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { HabitKind, Movement } from "../types";
import { QuickMovementForm } from "./QuickMovementForm";

interface Preset {
  kind?: HabitKind;
  accountId?: string;
}

interface QuickEntry {
  open: (preset?: Preset) => void;
  /** a page's own bar at the bottom (several movements picked) takes the button's place */
  setButtonHidden: (hidden: boolean) => void;
}

const Context = createContext<QuickEntry | null>(null);

/**
 * Logging a movement from any money page without leaving it: the + button, the N key, or a page's
 * New button open the quick form over the page; saved, it closes (or stays for the next one) and
 * says so with an Undo, which reverses it (rule 4).
 */
export function QuickEntryProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<{ open: boolean; preset: Preset; key: number }>({ open: false, preset: {}, key: 0 });
  const [buttonHidden, setButtonHidden] = useState(false);
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const open = useCallback((preset: Preset = {}) => setSheet((s) => ({ open: true, preset, key: s.key + 1 })), []);
  // a movement's own page and the full form have a form already
  const formPage = pathname?.startsWith(`${MONEY_ROUTES.transactions}/`) ?? false;

  useEffect(() => {
    if (formPage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog], [role=listbox], [role=menu]")) return;
      e.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formPage, open]);

  const post = async (movement: Movement) => {
    const tx = await moneyApi.movements.post(movement);
    await queryClient.invalidateQueries({ queryKey: moneyKeys.all });
    return tx;
  };
  const undo = async (id: string) => {
    try {
      await moneyApi.transactions.reverse(id);
      await queryClient.invalidateQueries({ queryKey: moneyKeys.all });
      toast.success("Undone: it no longer counts");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const value = useMemo(() => ({ open, setButtonHidden }), [open]);
  return (
    <Context.Provider value={value}>
      {children}
      {formPage || buttonHidden ? null : (
        <Button
          size="icon"
          onClick={() => open()}
          aria-label="New movement"
          title="New movement (N)"
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-30 h-14 w-14 rounded-full shadow-lg"
        >
          <Plus className="size-6" />
        </Button>
      )}
      <Sheet open={sheet.open} onOpenChange={(isOpen) => setSheet((s) => ({ ...s, open: isOpen }))}>
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-md"
          // the form puts the cursor in the amount
          onOpenAutoFocus={(e) => e.preventDefault()}
          // Escape closes the note's suggestions first
          onEscapeKeyDown={(e) => {
            if (document.activeElement?.getAttribute("aria-expanded") === "true") e.preventDefault();
          }}
          // an Undo in a toast is not a click away from the sheet
          onInteractOutside={(e) => {
            if (e.target instanceof Element && e.target.closest("[data-sonner-toaster]")) e.preventDefault();
          }}
        >
          <SheetHeader>
            <SheetTitle>New movement</SheetTitle>
            <SheetDescription>Enter saves. N opens this on any money page.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <QuickMovementForm
              key={sheet.key}
              initialKind={sheet.preset.kind}
              accountId={sheet.preset.accountId}
              onSubmit={post}
              onSaved={(tx, another) => {
                toast.success(`Saved: ${title(tx)}`, { action: { label: "Undo", onClick: () => void undo(tx.id) } });
                if (!another) setSheet((s) => ({ ...s, open: false }));
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </Context.Provider>
  );
}

/** Quick entry, from a money page; anywhere else, the full form. */
export function useQuickEntry(): QuickEntry {
  const router = useRouter();
  return useContext(Context) ?? { open: () => router.push(MONEY_ROUTES.newMovement()), setButtonHidden: () => {} };
}
