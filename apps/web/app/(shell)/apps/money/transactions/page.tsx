import { Suspense } from "react";
import TransactionsPage from "@tools/money/pages/TransactionsPage";

export default function Page() {
  return (
    <Suspense>
      <TransactionsPage />
    </Suspense>
  );
}
