"use client";

import { motion, Variants } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BookOpen, ArrowLeft } from "lucide-react";
import { useMotion } from "@platform/providers/MotionProvider";
import { useBookCoverStyle } from "@tools/reader/documents/useBookCoverStyle";
import { BookCover } from "@tools/reader/documents/library/BookCover";
import Link from "next/link";

import { PLATFORM_ROUTES } from "@platform/routes";
const container: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export default function ReaderSettingsPage() {
  const { enabled } = useMotion();
  const { backgroundStyle, setBackgroundStyle } = useBookCoverStyle();

  const Wrapper: React.ElementType = enabled ? motion.div : "div";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={PLATFORM_ROUTES.settings.root}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Reader Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Customize your reading experience
        </p>
      </div>

      <Wrapper
        {...(enabled
          ? {
              variants: container,
              initial: "hidden",
              whileInView: "show",
              viewport: { once: true, margin: "-10%" },
            }
          : {})}
      >
        <Card>
          <CardHeader>
            <CardTitle>Book Cover Style</CardTitle>
            <CardDescription>
              Choose the style for books without cover images
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Classic Preview */}
              <div
                className={`relative cursor-pointer rounded-lg border-2 p-3 transition-colors ${
                  backgroundStyle === "classic"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80"
                }`}
                onClick={() => setBackgroundStyle("classic")}
              >
                <div className="aspect-[2/3] w-full max-w-[120px] mx-auto">
                  <BookCover
                    title="Classic Novel"
                    author="Author Name"
                    backgroundStyle="classic"
                    className="rounded-sm"
                  />
                </div>
                <p className="mt-3 text-center text-sm font-medium">Classic</p>
                <p className="text-center text-xs text-muted-foreground">
                  Elegant traditional style
                </p>
              </div>

              {/* Modern Preview */}
              <div
                className={`relative cursor-pointer rounded-lg border-2 p-3 transition-colors ${
                  backgroundStyle === "modern"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80"
                }`}
                onClick={() => setBackgroundStyle("modern")}
              >
                <div className="aspect-[2/3] w-full max-w-[120px] mx-auto">
                  <BookCover
                    title="Example Book"
                    author="Author Name"
                    backgroundStyle="modern"
                    className="rounded-sm"
                  />
                </div>
                <p className="mt-3 text-center text-sm font-medium">Modern</p>
                <p className="text-center text-xs text-muted-foreground">
                  Clean contemporary look
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              This style applies to books in your library that don&apos;t have a custom cover image.
            </p>
          </CardContent>
        </Card>
      </Wrapper>
    </div>
  );
}
