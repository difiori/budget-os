import { ImageResponse } from "next/og";
import { IconMark, loadIconFont } from "./icon-mark";

// 180×180 é o tamanho que o iOS usa no ícone da tela de início.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const font = await loadIconFont();
  return new ImageResponse(<IconMark size={180} fontFamily={font ? "Poppins" : undefined} />, {
    ...size,
    fonts: font ? [{ name: "Poppins", data: font, weight: 700, style: "normal" }] : undefined,
  });
}
