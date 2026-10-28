import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Title row of every money page: icon, title, one line of context, actions on the right. */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          {Icon ? <Icon className="h-6 w-6 shrink-0" /> : null}
          <span className="truncate">{title}</span>
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** The page frame: width, padding and vertical rhythm shared by all money pages. */
export function MoneyPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl space-y-6 p-4 pt-14 sm:p-6 md:p-8">{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <div className="font-medium">{title}</div>
      {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
