import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth/session";


export default async function Home() {
  redirect((await getSesion()) ? "/dashboard" : "/login");
}
