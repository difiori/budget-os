import { type CalendarDate, isSameMonth, parseCalendarDate } from "./calendar-date";
import type { Saida } from "./types";

/** Regra 4 (extensão): gastos por categoria no mês, por `vencimento` — mesma
 * base de "Gastos do Mês" da conta, só que agrupada por categoria em vez de
 * somada no total. Saídas sem categoria (`A classificar`) ficam de fora. */
export function gastosPorCategoria(
  saidas: Saida[],
  mesReferencia: CalendarDate
): Map<string, number> {
  const totais = new Map<string, number>();
  for (const s of saidas) {
    if (!s.categoria_id || !s.vencimento) continue;
    if (!isSameMonth(parseCalendarDate(s.vencimento), mesReferencia)) continue;
    totais.set(s.categoria_id, (totais.get(s.categoria_id) ?? 0) + s.total_cents);
  }
  return totais;
}
