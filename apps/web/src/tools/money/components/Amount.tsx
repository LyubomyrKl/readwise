import { cn } from "@/lib/utils";
import { formatAmount, formatUnits, isNegative } from "../lib/format";
import type { AmountJson } from "../types";

/** A currency amount, exact, in tabular figures; negative amounts in the destructive color. */
export function Amount({
  amount,
  signed = false,
  muted = false,
  className,
}: {
  amount: AmountJson | null | undefined;
  signed?: boolean;
  /** no color for negatives (e.g. a debt shown as a balance) */
  muted?: boolean;
  className?: string;
}) {
  if (!amount) return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <span
      className={cn(
        "tabular-nums whitespace-nowrap",
        !muted && isNegative(amount.value) && "text-destructive",
        className
      )}
    >
      {formatAmount(amount, { signed })}
    </span>
  );
}

export function Units({ units, code, className }: { units: string | null | undefined; code?: string; className?: string }) {
  if (units == null) return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)}>
      {formatUnits(units)}
      {code ? <span className="text-muted-foreground"> {code}</span> : null}
    </span>
  );
}
