// app/auth/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ROUTES } from "../(consts)/routes";

export default function Index() {
  redirect(ROUTES.auth.login);
}
