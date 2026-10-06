import { Settings2 } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { getServerUser } from "@/lib/server/getServerUser";
import { isPlaceManager } from "@/lib/server/places/loadPlace";

/** Streamed island: managers get a way back to their workspace; the page itself stays shared. */
export async function ManagePlaceButton({ placeId }: { placeId: string }) {
  const user = await getServerUser();
  if (!user) return null;
  const role = await isPlaceManager(createAdminSupabaseClient(), placeId, user.id).catch(() => null);
  if (!role) return null;
  return (
    <Button variant="secondary" size="sm" icon={Settings2} href={`/business/places/${placeId}`}>
      Manage Place
    </Button>
  );
}
