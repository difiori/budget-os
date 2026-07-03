import { toZonedTime } from "date-fns-tz";

// Todo cálculo de ciclo/vencimento é feito em data civil (sem hora), sempre
// referenciada ao fuso America/Sao_Paulo — nunca ao fuso do servidor.
export const APP_TIME_ZONE = "America/Sao_Paulo";

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Converte uma string 'YYYY-MM-DD' (coluna `date` do Postgres) em CalendarDate. */
export function parseCalendarDate(iso: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    throw new Error(`Data inválida: "${iso}"`);
  }
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

export function formatCalendarDateISO(date: CalendarDate): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${date.year}-${mm}-${dd}`;
}

/** Converte um instante (timestamptz, ex. created_at) na data civil em America/Sao_Paulo. */
export function instantToCalendarDate(
  instant: string | Date,
  timeZone: string = APP_TIME_ZONE
): CalendarDate {
  const zoned = toZonedTime(instant, timeZone);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
  };
}

/** Data civil de "hoje" em America/Sao_Paulo, independente do fuso do servidor. */
export function hoje(
  agora: Date = new Date(),
  timeZone: string = APP_TIME_ZONE
): CalendarDate {
  return instantToCalendarDate(agora, timeZone);
}

export function isSameMonth(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Soma `amount` meses, ajustando o dia se o mês de destino for mais curto (ex.: 31 jan + 1 mês = 28/29 fev). */
export function addMonths(date: CalendarDate, amount: number): CalendarDate {
  const totalMonths = date.year * 12 + (date.month - 1) + amount;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const day = Math.min(date.day, daysInMonth(year, month));
  return { year, month, day };
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}
