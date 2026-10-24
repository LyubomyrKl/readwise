import { BookOpen, Library, UploadCloud } from "lucide-react";
import type { ToolManifest } from "@platform/shell/ToolManifest";
import { READER_ROUTES } from "./routes";

export const readerManifest: ToolManifest = {
  id: "reader",
  name: "Reader",
  description:
    "Upload PDF and EPUB books, read them with highlights and notes, and generate AI summaries.",
  icon: BookOpen,
  nav: [
    { title: "Library", icon: Library, href: READER_ROUTES.library },
    { title: "Upload", icon: UploadCloud, href: READER_ROUTES.upload },
  ],
  actionButton: { title: "Add books", href: READER_ROUTES.upload, icon: UploadCloud },
  settings: [
    {
      title: "Reader",
      description: "Book covers and reading experience",
      icon: BookOpen,
      href: READER_ROUTES.settings,
    },
  ],
};
