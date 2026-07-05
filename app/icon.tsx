import { ImageResponse } from "next/og";
import { IconMark, loadIconFont } from "./icon-mark";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  const font = await loadIconFont();
  return new ImageResponse(<IconMark size={512} fontFamily={font ? "Poppins" : undefined} />, {
    ...size,
    fonts: font ? [{ name: "Poppins", data: font, weight: 700, style: "normal" }] : undefined,
  });
}
