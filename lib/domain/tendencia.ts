import { type CalendarDate, addMonths, isSameMonth, parseCalendarDate } from "./calendar-date";
import type { Entrada, Saida } from "./types";

/** Últimos `n` meses terminando em `mesReferencia` (mais antigo primeiro). */
export function ultimosMeses(mesReferencia: CalendarDate, n: number): CalendarDate[] {
  return Array.from({ length: n }, (_, i) => addMonths(mesReferencia, i - (n - 1)));
}

/** Total de saídas por vencimento, um valor por mês em `meses`. */
export function gastosPorMes(saidas: Saida[], meses: CalendarDate[]): number[] {
  return meses.map((mes) =>
    saidas
      .filter((s) => s.vencimento !== null && isSameMonth(mes, parseCalendarDate(s.vencimento)))
      .reduce((sum, s) => sum + s.total_cents, 0)
  );
}

/** Total de entradas por data, um valor por mês em `meses`. */
export function entradasPorMes(entradas: Entrada[], meses: CalendarDate[]): number[] {
  return meses.map((mes) =>
    entradas
      .filter((e) => isSameMonth(mes, parseCalendarDate(e.data)))
      .reduce((sum, e) => sum + e.quantia_cents, 0)
  );
}
