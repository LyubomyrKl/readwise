"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EditionPanel } from "@tools/reader/editions/EditionPanel";
import { READER_ROUTES } from "@tools/reader/routes";

/** A book's abridged editions: make one, follow it chapter by chapter, open it when it is ready. */
export default function BookEditionPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;

  return (
    <div className="h-full overflow-y-auto bg-background pb-12">
      <div className="mx-auto w-full max-w-2xl px-6 pt-6">
        <button
          onClick={() => router.push(READER_ROUTES.bookProfile(bookId))}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the book
        </button>
      </div>
      <EditionPanel bookId={bookId} />
    </div>
  );
}
