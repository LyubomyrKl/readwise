import { Suspense } from "react";
import InsightsPage from "@tools/money/pages/InsightsPage";

export default function Page() {
  return (
    <Suspense>
      <InsightsPage />
    </Suspense>
  );
}
