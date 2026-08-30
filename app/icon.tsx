import { ImageResponse } from "next/og";
import { BrandMarkOg } from "@/lib/brand/BrandMarkOg";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<BrandMarkOg size={512} />, { ...size });
}
