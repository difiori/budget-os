import { ImageResponse } from "next/og";
import { IconMark, loadIconFont } from "../../icon-mark";

// Ícones do manifest (Android/desktop) em URLs estáveis: /manifest-icon/192,
// /manifest-icon/512 e /manifest-icon/maskable (com margem de segurança).
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "maskable" }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size === "maskable" ? 512 : Number(size) === 192 ? 192 : 512;
  const pad = size === "maskable" ? Math.round(px * 0.12) : 0;
  const font = await loadIconFont();
  return new ImageResponse(<IconMark size={px} pad={pad} fontFamily={font ? "Poppins" : undefined} />, {
    width: px,
    height: px,
    fonts: font ? [{ name: "Poppins", data: font, weight: 700, style: "normal" }] : undefined,
  });
}
