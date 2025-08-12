// app/auth/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ROUTES } from "../(consts)/pages";

export default function Index() {
  redirect(ROUTES.auth.login);
}
