import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useRef, useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IBook } from "../../types";
import { BookCover } from "./BookCover";
import { useBookCover } from "@/app/(providers)/BookCoverProvider/BookCoverProvider";
import { ROUTES } from "@/app/(consts)/routes";
import {
  AlertTriangle,
  BookCheck,
  BookHeart,
  Heart,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useBookMutations } from "@/hooks/useBookMutations";

type BookCardProps = {
  book: IBook;
  onFavoriteChange?: (bookId: string, isFavorite: boolean) => void;
};

export function BookCard({ book, onFavoriteChange }: BookCardProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [isFavorite, setIsFavorite] = useState(book.isFavorite);
  const [isPending, startTransition] = useTransition();
  const { backgroundStyle } = useBookCover();
  const router = useRouter();

  const { setFavorite } = useBookMutations({
    onFavoriteChange: (bookId, newValue) => {
      onFavoriteChange?.(bookId, newValue);
      toast.success(newValue ? "Added to favorites" : "Removed from favorites");
    },
    onError: () => {
      // Revert on error
      setIsFavorite(!isFavorite);
      toast.error("Failed to update favorite status");
    },
  });

  // Sync with prop changes (e.g., after refetch)
  useEffect(() => {
    setIsFavorite(book.isFavorite);
  }, [book.isFavorite]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const isTrunc =
      el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
    setTruncated(isTrunc);
  }, [book.title]);

  const handleCardClick = () => {
    router.push(`/reader/book/${book.id}/profile`);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card navigation
    const newValue = !isFavorite;
    setIsFavorite(newValue); // Optimistic update

    startTransition(async () => {
      await setFavorite(book.id, newValue);
    });
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
    >
      <Card 
        className="group relative overflow-hidden border-0 shadow-lg ring-1 ring-border/50 pt-3 gap-0 cursor-pointer hover:shadow-xl transition-shadow duration-300"
        onClick={handleCardClick}
      >
        <CardContent className="p-0">
          <div className="relative aspect-[2/3] w-full overflow-hidden">
            <BookCover
              title={book.title}
              author={book.author}
              cover={book.coverUrl}
              backgroundStyle={backgroundStyle}
            />
            <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/60 to-transparent" />
            </div>

            {/* Favorite button - appears on hover */}
            <button
              onClick={handleFavoriteClick}
              disabled={isPending}
              className={`absolute top-2 right-2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 ${
                isFavorite
                  ? "bg-red-500 text-white opacity-100"
                  : "bg-background/80 text-muted-foreground hover:bg-background hover:text-red-500"
              } backdrop-blur-sm shadow-sm`}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Heart className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`} />
              )}
            </button>
          </div>
        </CardContent>

        <CardContent className="p-2 sm:p-3 space-y-1.5 sm:space-y-2">
          <TooltipProvider>
            <Tooltip open={truncated ? undefined : false}>
              <TooltipTrigger asChild>
                <h3
                  ref={titleRef}
                  className="pointer-events-auto text-xs sm:text-sm font-semibold leading-snug line-clamp-2 min-h-[2rem] sm:min-h-[2.25rem]"
                >
                  {book.title}
                </h3>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[320px]">
                {book.title}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1 flex-1">
              {book.author}
            </p>
            {(isFavorite || book.isFinished || book.status === "error") && (
              <div className="flex gap-1">
                {book.status === "error" && (
                  <Badge
                    variant="destructive"
                    className="h-5 px-1.5 text-[10px] gap-1"
                    title={book.errorMessage || "Summary generation failed"}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Summary failed
                  </Badge>
                )}
                {isFavorite && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 border-muted">
                    <BookHeart className="w-3 h-3 fill-muted-foreground/40 text-muted-foreground" />
                  </Badge>
                )}
                {book.isFinished && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 border-muted">
                    <BookCheck className="w-3 h-3 text-muted-foreground" />
                  </Badge>
                )}
              </div>
            )}
          </div>
          {book.pageCount && (
            <>
              <Progress
                value={(book.pagePassCount / book.pageCount) * 100}
                className="h-1"
              />
              <div className="flex justify-between text-[10px] sm:text-[11px] text-muted-foreground">
                <span>
                  {book.pagePassCount}/{book.pageCount} pages
                </span>
                <span>{book.spentTime}h</span>
              </div>
            </>
          )}
          {!book.pageCount && (
            <div className="flex justify-end text-[10px] sm:text-[11px] text-muted-foreground">
              <span>{book.spentTime}h</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
