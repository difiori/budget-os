import { type CalendarDate, instantToCalendarDate, parseCalendarDate } from "./calendar-date";

/** Regra 3: se `data` for nula, usa `created_at` (convertido para America/Sao_Paulo). */
export function dataParaCalculo(saida: {
  data: string | null;
  created_at: string;
}): CalendarDate {
  if (saida.data) {
    return parseCalendarDate(saida.data);
  }
  return instantToCalendarDate(saida.created_at);
}
