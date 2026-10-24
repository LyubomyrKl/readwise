// app/auth/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { PLATFORM_ROUTES } from "@platform/routes";
export default function Index() {
  redirect(PLATFORM_ROUTES.auth.login);
}
