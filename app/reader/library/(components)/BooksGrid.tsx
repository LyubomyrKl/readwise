import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IBook } from "../../types";
import { BookCard } from "./BookCard";
import { useMotion } from "@/app/(providers)/MotionProvider/MotionProvider";
import { ROUTES } from "@/app/(consts)/routes";

interface BooksGridProps {
  books: IBook[];
  filteredBooks: IBook[];
  loading: boolean;
  error: string | null;
}

export function BooksGrid({ books, filteredBooks, loading, error }: BooksGridProps) {
  const { enabled } = useMotion();
  const Child: any = enabled ? motion.div : "div";

  if (loading) {
    return (
      <div className="mt-8 flex justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your books...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 text-center">
        <p className="text-red-500 mb-4">Error: {error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Try again
        </Button>
      </div>
    );
  }

  if (filteredBooks.length === 0) {
    return (
      <div className="mt-8 text-center">
        <div className="mx-auto w-64 h-48 mb-6 flex items-center justify-center bg-muted rounded-lg">
          <BookOpen className="h-16 w-16 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">
          {books.length === 0
            ? "No books in your library"
            : "No books match your filters"}
        </h3>
        <p className="text-muted-foreground mb-6">
          {books.length === 0
            ? "Start building your digital library by adding your first book."
            : "Try adjusting your search or filter criteria."}
        </p>
        {books.length === 0 && (
          <Button asChild>
            <Link href={ROUTES.reader.ingest.uploadFiles}>
              <Sparkles className="mr-2 h-4 w-4" /> Add your first book
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <Child
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.05 } },
      }}
      className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    >
      {filteredBooks.map((b) => (
        <BookCard key={b.id} book={b} />
      ))}
    </Child>
  );
}