/**
 * Classes compartilhadas dos filtros ("carimbo de tinta": selecionado inverte
 * para tinta sobre papel). Ficam num módulo neutro para servir tanto o Chip
 * clicável (client) quanto filtros de link renderizados no servidor.
 */
export function chipClasses(selected: boolean): string {
  const base =
    "type-label inline-flex h-8 items-center rounded-sm border px-3 transition-colors disabled:opacity-40";
  return selected
    ? `${base} border-transparent bg-chip-ink text-on-chip-ink`
    : `${base} border-hairline-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink`;
}
