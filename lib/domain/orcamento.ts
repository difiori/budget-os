/**
 * Percentual do realizado em relação a uma meta — usado tanto no orçamento
 * por categoria quanto nas metas de poupança. Pode passar de 100; quem exibe
 * decide como tratar (cor de alerta, clamp visual etc.).
 */
export function progressoPercent(realizadoCents: number, metaCents: number): number {
  if (metaCents <= 0) return 0;
  return (realizadoCents / metaCents) * 100;
}
