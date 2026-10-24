"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutGrid, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PLATFORM_ROUTES } from "@platform/routes";
import { TOOLS, findToolByPath } from "./registry";
import { toolBasePath } from "./ToolManifest";

interface AppSwitcherProps {
  className?: string;
  showLabel?: boolean;
  onNavigate?: () => void;
}

/** Jump between the dashboard, the tools from the registry, and settings. */
export function AppSwitcher({ className, showLabel = true, onNavigate }: AppSwitcherProps) {
  const pathname = usePathname() ?? PLATFORM_ROUTES.home;
  const current = findToolByPath(pathname);
  const CurrentIcon = current?.icon ?? LayoutGrid;
  const currentName = current?.name ?? "Workbench";

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
              <span className="font-semibold">{currentName}</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link
            href={PLATFORM_ROUTES.home}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 cursor-pointer",
              !current && pathname === PLATFORM_ROUTES.home && "bg-accent"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = current?.id === tool.id;
          return (
            <DropdownMenuItem key={tool.id} asChild>
              <Link
                href={toolBasePath(tool.id)}
                onClick={onNavigate}
                className={cn("flex items-center gap-3 cursor-pointer", isActive && "bg-accent")}
              >
                <Icon className="h-4 w-4" />
                <span>{tool.name}</span>
                {isActive && (
                  <span className="ml-auto text-xs text-muted-foreground">Current</span>
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href={PLATFORM_ROUTES.settings.root}
            onClick={onNavigate}
            className="flex items-center gap-3 cursor-pointer"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
