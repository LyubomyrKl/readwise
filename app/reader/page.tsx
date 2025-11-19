import { redirect } from "next/navigation";
import { ROUTES } from "../(consts)/routes";
export default function Index() {
  redirect(ROUTES.reader.library);
}
