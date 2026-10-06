import { permanentRedirect } from "next/navigation";
import { eventEditPath } from "@/lib/events/eventUrls";

/** Editing lives in the manage tabs now (spec §7.6.4). */
export default async function EventEditRedirect({ params }: { params: Promise<{ beaconId: string }> }) {
  const { beaconId } = await params;
  permanentRedirect(eventEditPath(beaconId));
}
