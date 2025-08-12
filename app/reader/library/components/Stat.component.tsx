export function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-background/70 px-3 py-1.5 text-sm shadow-sm ring-1 ring-border/60">
        <span className="font-medium">{value}</span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
