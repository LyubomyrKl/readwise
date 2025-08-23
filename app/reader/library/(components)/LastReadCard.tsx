import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  BookOpen,
  Clock,
  Star,
  Bookmark,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Stat } from "./Stat";
import { prettyDate, progress, getMinutesLeft } from "../utils";
import { useMotion } from "@/app/(providers)/MotionProvider/MotionProvider";
import { IBook } from '@/app/reader/types';
import { BookCover } from '@/app/reader/library/(components)/BookCover';
import { useBookCover } from '@/app/(providers)/BookCoverProvider/BookCoverProvider';


interface LastReadCardProps {
  dynamicBg: string;
  lastBook: IBook;
}

export function LastReadCard({ dynamicBg, lastBook }: LastReadCardProps) {
  const { enabled } = useMotion();
  const Wrapper: any = enabled ? motion.div : "div";
  const { backgroundStyle } = useBookCover();

  return (
    <>
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-[65vh] -z-10">
        {lastBook.coverUrl && <Image
          fill
          priority
          alt={'Book cover'}
          src={lastBook.coverUrl}
          className="object-cover blur-2xl opacity-20 scale-110"

        />}
        <div
          className="absolute inset-0"
          style={{ backgroundImage: dynamicBg }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-transparent" />
      </div>

      <Wrapper
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Card className="overflow-hidden border-0 shadow-lg ring-1 ring-border/50">
          <CardHeader className="gap-1 pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <BookOpen className="h-5 w-5" /> Last read
            </CardTitle>
            <CardDescription>Pick up right where you stopped</CardDescription>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-6 pb-2 md:grid-cols-[220px_1fr]">
            <div className="relative mx-auto h-[300px] w-[220px] overflow-hidden rounded-2xl shadow-md md:mx-0">
              <BookCover
                title={lastBook.title}
                author={lastBook.author}
                cover={lastBook.coverUrl}
                backgroundStyle={backgroundStyle}
              />
            </div>

            <div className="flex flex-col justify-between">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold leading-tight sm:text-xl">
                  {lastBook.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  by {lastBook.author}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                  {lastBook.lastAccessed && <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" /> Last read{' '}
                    {prettyDate(lastBook.lastAccessed)}
                  </span>}
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-4 w-4" /> 3
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Bookmark className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {lastBook.description}
                </p>
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="color-inherit">
                      {lastBook.pagePassCount} / {lastBook.pageCount} pages
                      read{" "}
                      <span className="text-muted-foreground">
                        ~ {progress(lastBook, true)}%
                      </span>
                    </span>

                  </div>

                  <Progress value={progress(lastBook)} className="h-2" />
                </div>
              </div>

              <div className="mt-1 flex gap-2">
                {lastBook.tags.map((t) => (
                  <Badge
                    key={t.name}
                    variant="secondary"
                    className="backdrop-blur"
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="sm">
                  <Link href={`/reader/${lastBook.id}`}>
                    Continue reading
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/books/${lastBook.id}`}>View details</Link>
                </Button>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-wrap items-center gap-4 border-t bg-muted/30 px-6 py-4">
            <Stat label="Total pages" value="464" />
            <Stat label="Notes" value="18" />
            <Stat label="Highlights" value="73" />
          </CardFooter>
        </Card>
      </Wrapper>
    </>
  );
}