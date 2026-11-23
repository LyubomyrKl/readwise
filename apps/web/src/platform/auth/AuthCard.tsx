import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PLATFORM_ROUTES } from "@platform/routes";

/** The sign-in pages' card (forgot and reset password), with the way back to signing in under it. */
export function AuthCard({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-svh w-full max-w-[1120px] place-items-center px-3 sm:px-4">
      <div className="w-full max-w-[420px] px-1 sm:px-0">
        <Card className="border-0 bg-card/70 shadow-lg ring-1 ring-border/60 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span className="text-xs tracking-wide">Secure area</span>
            </div>
            <CardTitle className="text-xl sm:text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
          <CardFooter>
            <Link href={PLATFORM_ROUTES.auth.login} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

/** What a failed call says, for the pages around signing in. */
export function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Try again in a moment.";
}
