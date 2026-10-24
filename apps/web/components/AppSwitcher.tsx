"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookOpen, ChevronDown, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/app/(consts)/routes";

type AppId = "reader";

interface AppInfo {
  id: AppId;
  name: string;
  icon: React.ElementType;
  href: string;
  matchPath: string;
}

const apps: AppInfo[] = [
  {
    id: "reader",
    name: "Reader",
    icon: BookOpen,
    href: ROUTES.reader.library,
    matchPath: "/reader",
  },
];

interface AppSwitcherProps {
  className?: string;
  showLabel?: boolean;
  onNavigate?: () => void;
}

export function AppSwitcher({ className, showLabel = true, onNavigate }: AppSwitcherProps) {
  const pathname = usePathname();

  const currentApp = apps.find((app) => pathname?.startsWith(app.matchPath)) || apps[0];
  const CurrentIcon = currentApp.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={showLabel ? "default" : "icon"}
          className={cn(
            "flex items-center hover:bg-muted/50",
            showLabel ? "gap-2 px-2 h-auto py-1.5" : "h-8 w-8",
            className
          )}
        >
          <CurrentIcon className="h-5 w-5" />
          {showLabel && (
            <>
              <span className="font-semibold">{currentApp.name}</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {apps.map((app) => {
          const Icon = app.icon;
          const isActive = currentApp.id === app.id;
          return (
            <DropdownMenuItem key={app.id} asChild>
              <Link
                href={app.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 cursor-pointer",
                  isActive && "bg-accent"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{app.name}</span>
                {isActive && (
                  <span className="ml-auto text-xs text-muted-foreground">Current</span>
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuItem asChild>
          <Link
            href={ROUTES.settings.root}
            onClick={onNavigate}
            className="flex items-center gap-3 cursor-pointer border-t mt-1 pt-1"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
