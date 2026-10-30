import { Suspense } from "react";
import ClaudeConnectPage from "@tools/money/pages/ClaudeConnectPage";

export default function Page() {
  return (
    <Suspense>
      <ClaudeConnectPage />
    </Suspense>
  );
}
