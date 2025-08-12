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

import { IBookDetail } from "../page";
import Image from "next/image";
import { useRef, useState, useEffect } from "react";

export function BookCard({ book }: { book: IBookDetail }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const isTrunc =
      el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
    setTruncated(isTrunc);
  }, [book.title]);

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
    >
      <Card className="group relative overflow-hidden border-0 shadow-lg ring-1 ring-border/50 pt-3 gap-0">
        <CardContent className="p-0">
          <div className="relative aspect-[2/3] w-full overflow-hidden">
            <Image
              src={book.cover}
              alt={`${book.title} cover`}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width:768px) 100vw, 25vw"
            />
            <div className="absolute left-2 top-2 flex gap-2">
              {book.isFavorite && (
                <Badge className="backdrop-blur">★ Favorite</Badge>
              )}
              {book.isFinished && (
                <Badge variant="secondary" className="backdrop-blur">
                  Finished
                </Badge>
              )}
            </div>
          </div>
        </CardContent>

        <CardContent className="p-3 space-y-2">
          <TooltipProvider>
            <Tooltip open={truncated ? undefined : false}>
              <TooltipTrigger asChild>
                <h3
                  ref={titleRef}
                  className="pointer-events-auto text-sm font-semibold leading-snug line-clamp-2 min-h-[2.25rem]"
                >
                  {book.title}
                </h3>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[320px]">
                {book.title}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {book.author}
          </p>
          <Progress
            value={(book.pagePassCount / book.pageCount) * 100}
            className="h-1"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              {book.pagePassCount}/{book.pageCount} pages
            </span>
            <span>{book.spentHours}h spent</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
