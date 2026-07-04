import { type CalendarDate, addMonths } from "./calendar-date";
import type { MetodoPagamento } from "./types";

/**
 * Regra 7 (regra alvo, diferente do legado onde vencimento = data):
 * Crédito -> dia 10 do mês seguinte à `data` (entra em fatura de cartão,
 * já que o fechamento de todos os cartões é sempre no último dia do mês).
 * Débito -> vencimento = data (liquidação imediata).
 */
export function calcularVencimento(
  data: CalendarDate,
  metodo: MetodoPagamento
): CalendarDate {
  if (metodo === "Crédito") {
    const mesSeguinte = addMonths(data, 1);
    return { ...mesSeguinte, day: 10 };
  }
  return data;
}
