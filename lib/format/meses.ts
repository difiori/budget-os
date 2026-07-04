import type { CalendarDate } from "@/lib/domain/calendar-date";

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

/** "Julho de 2026" — rótulo padrão de recorte mensal em todo o app. */
export function labelMes(mes: Pick<CalendarDate, "month" | "year">): string {
  return `${MESES[mes.month - 1]} de ${mes.year}`;
}
