import { readerManifest } from "@tools/reader/manifest";
import { moneyManifest } from "@tools/money/manifest";
import { toolBasePath, type ToolManifest } from "./ToolManifest";

/**
 * The only file in the platform that knows which tools exist.
 * Adding a tool: import its manifest and append it here.
 */
const ALL_TOOLS: readonly ToolManifest[] = [readerManifest, moneyManifest];

export const TOOLS: readonly ToolManifest[] = ALL_TOOLS.filter(
  (tool) => tool.enabled !== false
);

export function findToolByPath(pathname: string): ToolManifest | undefined {
  return TOOLS.find((tool) => {
    const base = toolBasePath(tool.id);
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}
