import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Seletor de mês único do app — toda página com recorte mensal usa este.
 * Usa next/link pra não recarregar a página inteira a cada troca de mês. */
export function MonthSelector({
  label,
  hrefAnterior,
  hrefSeguinte,
}: {
  label: string;
  hrefAnterior: string;
  hrefSeguinte: string;
}) {
  return (
    <div className="flex items-center rounded-sm border border-hairline-strong bg-surface">
      <Link
        href={hrefAnterior}
        aria-label="Mês anterior"
        className="flex h-9 w-9 items-center justify-center text-ink-2 transition-colors hover:text-ink"
      >
        <ChevronLeft size={16} />
      </Link>
      <p className="type-label figures min-w-32 select-none text-center text-ink">{label}</p>
      <Link
        href={hrefSeguinte}
        aria-label="Próximo mês"
        className="flex h-9 w-9 items-center justify-center text-ink-2 transition-colors hover:text-ink"
      >
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}
