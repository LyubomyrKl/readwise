import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { changeLabel, type Tone } from "../../lib/insights";

const TONE: Record<Tone, string> = {
  good: "border-emerald-600/30 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-600/30 text-amber-700 dark:text-amber-400",
  neutral: "text-muted-foreground",
};

/** "12% above usual" as a chip: an arrow and words, the color only a hint (more spending is the warning). */
export function Change({ change, kind }: { change: string | null; kind: "expense" | "income" }) {
  const label = changeLabel(change, kind);
  if (!label) return null;
  const Icon = label.direction === "up" ? ArrowUpRight : label.direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs", TONE[label.tone])}>
      <Icon className="h-3 w-3" /> {label.text}
    </span>
  );
}
