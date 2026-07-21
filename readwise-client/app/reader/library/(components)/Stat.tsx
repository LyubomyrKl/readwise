import {Bookmark} from "lucide-react";

export function Stat({
  label,
  value,
    icon
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-background/70 px-3 py-1.5 text-sm shadow-sm ring-1 ring-border/60">
        <span className="font-medium">{value}</span>
      </div>
        <div className="flex items-center gap-1">
            {icon}
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>

    </div>
  );
}
