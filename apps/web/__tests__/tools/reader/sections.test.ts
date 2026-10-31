import { sectionTitleAt } from "@tools/reader/reading/shell/sections";
import type { StructureSection } from "@tools/reader/types";

const section = (title: string, page?: number): StructureSection =>
  ({ id: title, title, level: 1, kind: "chapter", words: 100, figures: 0, included: true, page }) as StructureSection;

describe("sectionTitleAt", () => {
  const sections = [section("Preface", 1), section("Chapter 1", 3), section("1.1 Ports", 3), section("Chapter 2", 9)];

  it("names the last section that starts on or before the page (0-based in the locator)", () => {
    expect(sectionTitleAt(sections, 0)).toBe("Preface");
    expect(sectionTitleAt(sections, 2)).toBe("1.1 Ports");
    expect(sectionTitleAt(sections, 7)).toBe("1.1 Ports");
    expect(sectionTitleAt(sections, 8)).toBe("Chapter 2");
  });

  it("has nothing to say without pages (structures read before readers v2) or a page", () => {
    expect(sectionTitleAt([section("Chapter 1")], 4)).toBeUndefined();
    expect(sectionTitleAt(sections, undefined)).toBeUndefined();
    expect(sectionTitleAt(undefined, 3)).toBeUndefined();
  });
});
