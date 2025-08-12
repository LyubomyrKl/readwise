import { redirect } from "next/navigation";
export default function Index() {
  redirect("/library"); // or "/about"
}
