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
import { Stat } from "./Stat.component";
import { prettyDate, progress, getMinutesLeft } from "../utils";
import { useMotion } from "@/app/(providers)/MotionProvider/MotionProvider";

const lastBook = {
  id: "clean-code",
  title: "Clean Code: A Handbook of Agile Software Craftsmanship",
  author: "Robert C. Martin",
  cover: "https://m.media-amazon.com/images/I/51E2055ZGUL._SY425_.jpg",
  pageCount: 521,
  pagePassCount: 65,
  spentHours: 1.5,
  lastReadAt: "2025-08-08T21:10:00Z",
  currentChapter: "Chapter 10 – Classes",
  rating: 4.7,
  tags: ["Software", "Craft", "Best practices"],
  minutesLeft: 175,
  description:
    "Practical principles for writing maintainable, readable code. Focuses on naming, functions, classes, error handling, and tests with real refactoring examples.",
};

interface LastReadCardProps {
  dynamicBg: string;
}

export function LastReadCard({ dynamicBg }: LastReadCardProps) {
  const { enabled } = useMotion();
  const Wrapper: any = enabled ? motion.div : "div";

  return (
    <>
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-[65vh] -z-10">
        <Image
          src={lastBook.cover}
          alt=""
          fill
          className="object-cover blur-2xl opacity-20 scale-110"
          priority
        />
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
              <Image
                src={lastBook.cover}
                alt={`${lastBook.title} cover`}
                fill
                sizes="220px"
                className="object-cover"
                priority
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
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" /> Last read{" "}
                    {prettyDate(lastBook.lastReadAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-4 w-4" /> {lastBook.rating}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Bookmark className="h-4 w-4" /> {lastBook.currentChapter}
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

                    <span>~{getMinutesLeft(lastBook, "short")} min left</span>
                  </div>

                  <Progress value={progress(lastBook)} className="h-2" />
                </div>
              </div>

              <div className="mt-1 flex gap-2">
                {lastBook.tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="backdrop-blur"
                  >
                    {t}
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