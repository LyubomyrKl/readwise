"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/app/(consts)/routes";
import { Loader2 } from "lucide-react";

export default function LearningSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(ROUTES.settings.learning);
  }, [router]);

  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
