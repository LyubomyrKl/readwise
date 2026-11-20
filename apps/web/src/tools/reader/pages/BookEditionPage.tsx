"use client";

import { useParams } from "next/navigation";
import { BackLink } from "@platform/ui/BackLink";
import { EditionPanel } from "@tools/reader/editions/EditionPanel";
import { READER_ROUTES } from "@tools/reader/routes";

/** A book's abridged editions: make one, follow it chapter by chapter, open it when it is ready. */
export default function BookEditionPage() {
  const params = useParams();
  const bookId = params.id as string;

  return (
    <div className="h-full overflow-y-auto bg-background pb-12">
      <div className="mx-auto w-full max-w-2xl px-6 pt-6">
        <BackLink fallback={READER_ROUTES.bookProfile(bookId)} />
      </div>
      <EditionPanel bookId={bookId} />
    </div>
  );
}
