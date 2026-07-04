/** Bloco pulsante genérico pra telas de loading.tsx — some sozinho quando o conteúdo real chega. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-hairline-strong/60 ${className}`} />;
}
