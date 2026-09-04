import { parseParcela } from "@/lib/domain/parcelamento";

/**
 * Selo de parcela ao lado do nome, no lugar do "02/10" solto: uma trilha
 * curta mostra quanto do parcelamento já passou e o texto diz "2 de 10". A
 * última parcela ganha a cor da marca — é a boa notícia da lista. Parcela
 * fora do padrão NN/NN cai no texto original.
 */
export function ParcelaTag({ parcela, className = "" }: { parcela: string | null | undefined; className?: string }) {
  if (!parcela) return null;
  const p = parseParcela(parcela);
  if (!p) return <span className={`type-caption shrink-0 rounded-xs bg-track px-1 text-ink-3 ${className}`}>{parcela}</span>;
  const ultima = p.atual === p.total;
  const pct = Math.round((p.atual / p.total) * 100);
  return (
    <span
      className={`type-caption inline-flex shrink-0 items-center gap-1.5 rounded-xs px-1.5 ${ultima ? "bg-brand-tint text-on-brand-tint" : "bg-track text-ink-3"} ${className}`}
      title={ultima ? `Última parcela (${p.total} de ${p.total})` : `Parcela ${p.atual} de ${p.total} · faltam ${p.total - p.atual}`}
    >
      <span className={`relative h-1 w-5 overflow-hidden rounded-full ${ultima ? "bg-on-brand-tint/20" : "bg-hairline-strong"}`} aria-hidden="true">
        <span className={`absolute inset-y-0 left-0 rounded-full ${ultima ? "bg-on-brand-tint" : "bg-ink-3"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="figures whitespace-nowrap">{ultima ? `última de ${p.total}` : `${p.atual} de ${p.total}`}</span>
    </span>
  );
}
