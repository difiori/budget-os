/** Selo discreto de "conta fixa" (ocorrência gerada por um contrato). */
export function FixaTag({ className = "" }: { className?: string }) {
  return <span className={`type-caption shrink-0 rounded-xs bg-track px-1 text-ink-3 ${className}`}>fixa</span>;
}
