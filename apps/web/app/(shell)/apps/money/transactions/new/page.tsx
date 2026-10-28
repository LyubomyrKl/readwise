import { Suspense } from "react";
import NewMovementPage from "@tools/money/pages/NewMovementPage";

export default function Page() {
  return (
    <Suspense>
      <NewMovementPage />
    </Suspense>
  );
}
