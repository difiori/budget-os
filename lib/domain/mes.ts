import { type CalendarDate, isSameMonth, parseCalendarDate } from "./calendar-date";
import type { SaidaParaCalculo } from "./types";

interface EntradaParaCalculo {
  quantia_cents: number;
  data: string;
  conta_destino_id: string;
}

/** Regra 4: Gastos do Mês (conta) = soma das saídas da conta com `vencimento` no mês corrente. */
export function gastosDoMesCents(
  contaId: string,
  saidas: SaidaParaCalculo[],
  mesReferencia: CalendarDate
): number {
  return saidas
    .filter((s) => s.conta_id === contaId)
    .filter((s) => s.vencimento !== null)
    .filter((s) => isSameMonth(parseCalendarDate(s.vencimento as string), mesReferencia))
    .reduce((sum, s) => sum + s.total_cents, 0);
}

/** Regra 4: Entradas do Mês = soma das entradas da conta com `data` no mês corrente. */
export function entradasDoMesCents(
  contaId: string,
  entradas: EntradaParaCalculo[],
  mesReferencia: CalendarDate
): number {
  return entradas
    .filter((e) => e.conta_destino_id === contaId)
    .filter((e) => isSameMonth(parseCalendarDate(e.data), mesReferencia))
    .reduce((sum, e) => sum + e.quantia_cents, 0);
}

/** Regra 4: Saldo Previsto = saldo_atual + entradas do mês - gastos do mês. */
export function saldoPrevistoCents(
  saldoAtualCents: number,
  entradasDoMes: number,
  gastosDoMes: number
): number {
  return saldoAtualCents + entradasDoMes - gastosDoMes;
}
