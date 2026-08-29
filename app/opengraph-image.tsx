import { ImageResponse } from "next/og";
import { BrandMarkOg } from "@/lib/brand/BrandMarkOg";

export const alt = "Click";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0F0A1A",
        }}
      >
        <BrandMarkOg size={420} />
      </div>
    ),
    { ...size },
  );
}
