import { redirect } from "next/navigation";

/**
 * Legacy `/dashboard` URL. Birthday and connections load live on `/` so this
 * hop must not mount a second "Loading your connections" screen.
 */
export default function Dashboard() {
  redirect("/");
}
