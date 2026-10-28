import { Suspense } from "react";
import MoneyHomePage from "@tools/money/pages/MoneyHomePage";

export default function Page() {
  return (
    <Suspense>
      <MoneyHomePage />
    </Suspense>
  );
}
