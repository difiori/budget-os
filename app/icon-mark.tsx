import type { ReactElement } from "react";

/** Carrega a Poppins 700 (TTF) para o glifo do ícone. Cache em memória; UA
 * antiga força o Google a servir TTF (o Satori não lê woff2). Fallback null. */
let fontCache: ArrayBuffer | null | undefined;
export async function loadIconFont(): Promise<ArrayBuffer | null> {
  if (fontCache !== undefined) return fontCache;
  try {
    const css = await fetch("https://fonts.googleapis.com/css2?family=Poppins:wght@700", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 5.1)" },
    }).then((r) => r.text());
    const url =
      css.match(/src:\s*url\(([^)]+)\)\s*format\('truetype'\)/)?.[1] ??
      css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    fontCache = url ? await fetch(url).then((r) => r.arrayBuffer()) : null;
  } catch {
    fontCache = null;
  }
  return fontCache ?? null;
}

/**
 * Marca do Budget OS para ImageResponse (ícone do app): tile preto neutro com
 * leve profundidade (gradiente + brilho glass sutil + aro) e um cifrão verde ao
 * centro — no espírito do ícone do Miro. `pad` reserva margem para "maskable".
 */
export function IconMark({
  size,
  pad = 0,
  fontFamily,
}: {
  size: number;
  pad?: number;
  fontFamily?: string;
}): ReactElement {
  const inner = size - pad * 2;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: "linear-gradient(165deg, #1f1f21 0%, #0a0a0a 100%)",
      }}
    >
      {/* Brilho glass no topo */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "55%",
          display: "flex",
          background: "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 100%)",
        }}
      />
      {/* Aro interno sutil */}
      <div
        style={{
          position: "absolute",
          inset: Math.round(inner * 0.055),
          display: "flex",
          borderRadius: inner * 0.16,
          border: `${Math.max(1, inner * 0.005)}px solid rgba(255,255,255,0.08)`,
        }}
      />
      {/* Cifrão */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: inner * 0.62,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: -inner * 0.01,
          color: "#4cc38a",
          ...(fontFamily ? { fontFamily } : {}),
        }}
      >
        $
      </div>
    </div>
  );
}
