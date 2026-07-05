import { ImageResponse } from "next/og";
import { IconMark } from "./icon-mark";

// 180×180 é o tamanho que o iOS usa no ícone da tela de início.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconMark size={180} />, { ...size });
}
