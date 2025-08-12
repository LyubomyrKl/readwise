import { redirect } from "next/navigation";
import { ROUTES } from "../(consts)/pages";
export default function Index() {
  redirect(ROUTES.reader.library);
}
