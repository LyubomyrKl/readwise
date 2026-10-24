import fs from "node:fs";
import path from "node:path";
import { TOOLS, findToolByPath } from "@platform/shell/registry";
import { toolBasePath } from "@platform/shell/ToolManifest";

describe("tool registry", () => {
  it("has at least one tool with unique, url-safe ids", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
    const ids = TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("mounts every tool at /apps/<id> with a route directory in the shell", () => {
    for (const tool of TOOLS) {
      const dir = path.join(process.cwd(), "app", "(shell)", "apps", tool.id);
      expect(fs.existsSync(path.join(dir, "page.tsx"))).toBe(true);
    }
  });

  it("keeps nav inside the tool and settings under /settings", () => {
    for (const tool of TOOLS) {
      const base = toolBasePath(tool.id);
      for (const entry of tool.nav) {
        const hrefs = "href" in entry ? [entry.href] : entry.items.map((i) => i.href);
        for (const href of hrefs) expect(href.startsWith(base)).toBe(true);
      }
      for (const section of tool.settings ?? []) {
        expect(section.href.startsWith("/settings/")).toBe(true);
      }
    }
  });

  it("resolves the current tool from a pathname", () => {
    expect(findToolByPath("/apps/reader")?.id).toBe("reader");
    expect(findToolByPath("/apps/reader/book/1/read")?.id).toBe("reader");
    expect(findToolByPath("/apps/readers")).toBeUndefined();
    expect(findToolByPath("/settings/reader")).toBeUndefined();
    expect(findToolByPath("/")).toBeUndefined();
  });
});
