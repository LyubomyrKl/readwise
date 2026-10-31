import type { StructureSection } from "../../types";

/**
 * The title of the section a PDF page belongs to, from the server's structure (its sections carry
 * their first page): the last section, in reading order, that starts on or before the page. The
 * PDF engine knows only the outline entries whose page it has resolved, and resolving all of them
 * would load page objects across the whole file.
 */
export function sectionTitleAt(sections: StructureSection[] | undefined, page: number | undefined): string | undefined {
  if (!sections || page === undefined) return undefined;
  let title: string | undefined;
  for (const section of sections) {
    if (section.page !== undefined && section.page <= page + 1) title = section.title;
  }
  return title;
}
