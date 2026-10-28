import { Suspense } from "react";
import ReportsPage from "@tools/money/pages/ReportsPage";

export default function Page() {
  return (
    <Suspense>
      <ReportsPage />
    </Suspense>
  );
}
