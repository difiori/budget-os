import type { ReactElement } from "react";

/**
 * Marca do Budget OS renderizada para ImageResponse (ícone do app). Fundo
 * verde-garrafa cheio (o iOS arredonda os cantos e ignora transparência),
 * monograma "B" em papel e a régua contábil dupla — assinatura do sistema.
 * `pad` reserva margem interna para uso como ícone "maskable".
 */
export function IconMark({ size, pad = 0 }: { size: number; pad?: number }): ReactElement {
  const inner = size - pad * 2;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e4d3b",
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: inner * 0.6,
            fontWeight: 600,
            color: "#f2f7f2",
            lineHeight: 1,
            letterSpacing: -inner * 0.02,
          }}
        >
          B
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: inner * 0.035, marginTop: inner * 0.09 }}>
          <div style={{ width: inner * 0.42, height: Math.max(2, inner * 0.02), background: "#8fc4a8" }} />
          <div style={{ width: inner * 0.42, height: Math.max(2, inner * 0.02), background: "#8fc4a8" }} />
        </div>
      </div>
    </div>
  );
}
