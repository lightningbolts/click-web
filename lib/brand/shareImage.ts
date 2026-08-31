import { publicOrigin } from "@/lib/events/eventUrls";

/** Current Click mark served by `app/opengraph-image.png`. */
export const BRAND_SHARE_IMAGE_PATH = "/opengraph-image";

export function brandShareImage(origin = publicOrigin()) {
  return {
    url: `${origin}${BRAND_SHARE_IMAGE_PATH}`,
    width: 1200,
    height: 630,
    alt: "Click",
  };
}
