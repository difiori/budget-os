import { type CalendarDate, addMonths, daysInMonth } from "./calendar-date";
import type { Cartao } from "./types";

/**
 * Ciclo de um cartão de crédito: dia em que a fatura fecha e dia em que vence.
 *
 * - A "fatura de M" fecha no `dia_fechamento` de M (limitado ao último dia do
 *   mês; 31 = último dia). Ela reúne as compras feitas depois do fechamento
 *   de M−1 até o fechamento de M, inclusive.
 * - Vence no `dia_vencimento` do próprio M, se esse dia cai depois do
 *   fechamento; senão, no mês seguinte. (Fecha 31 e vence 10 → dia 10 de M+1,
 *   a regra 7 histórica. Fecha 5 e vence 15 → dia 15 do próprio M.)
 */
export interface CicloCartao {
  dia_fechamento: number;
  dia_vencimento: number;
}

/** Ciclo histórico do app: fecha no último dia do mês, vence dia 10 do seguinte. */
export const CICLO_PADRAO: CicloCartao = { dia_fechamento: 31, dia_vencimento: 10 };

export function cicloDoCartao(
  cartao: Pick<Cartao, "dia_fechamento" | "dia_vencimento"> | null | undefined
): CicloCartao {
  if (!cartao) return CICLO_PADRAO;
  return { dia_fechamento: cartao.dia_fechamento, dia_vencimento: cartao.dia_vencimento };
}

/** Dia em que a fatura do mês fecha, já limitado ao tamanho do mês. */
export function diaFechamentoNoMes(ciclo: CicloCartao, mes: Pick<CalendarDate, "year" | "month">): number {
  return Math.min(ciclo.dia_fechamento, daysInMonth(mes.year, mes.month));
}

/** A que fatura (mês, dia 1) uma compra pertence. */
export function mesDaFatura(data: CalendarDate, ciclo: CicloCartao): CalendarDate {
  const mes = { year: data.year, month: data.month, day: 1 };
  return data.day <= diaFechamentoNoMes(ciclo, mes) ? mes : addMonths(mes, 1);
}

/** Data de fechamento da fatura de um mês. */
export function fechamentoDaFatura(mesFatura: Pick<CalendarDate, "year" | "month">, ciclo: CicloCartao): CalendarDate {
  return { year: mesFatura.year, month: mesFatura.month, day: diaFechamentoNoMes(ciclo, mesFatura) };
}

/** Data de vencimento da fatura de um mês. */
export function vencimentoDaFatura(mesFatura: Pick<CalendarDate, "year" | "month">, ciclo: CicloCartao): CalendarDate {
  const fecha = diaFechamentoNoMes(ciclo, mesFatura);
  const alvo = ciclo.dia_vencimento > fecha ? { ...mesFatura, day: 1 } : addMonths({ ...mesFatura, day: 1 }, 1);
  return { year: alvo.year, month: alvo.month, day: Math.min(ciclo.dia_vencimento, daysInMonth(alvo.year, alvo.month)) };
}

/** Intervalo (inclusivo) de datas de compra que caem na fatura de um mês. */
export function periodoDaFatura(
  mesFatura: Pick<CalendarDate, "year" | "month">,
  ciclo: CicloCartao
): { inicio: CalendarDate; fim: CalendarDate } {
  const anterior = addMonths({ ...mesFatura, day: 1 }, -1);
  const fechaAnterior = fechamentoDaFatura(anterior, ciclo);
  const inicio =
    fechaAnterior.day >= daysInMonth(anterior.year, anterior.month)
      ? { year: mesFatura.year, month: mesFatura.month, day: 1 }
      : { ...fechaAnterior, day: fechaAnterior.day + 1 };
  return { inicio, fim: fechamentoDaFatura(mesFatura, ciclo) };
}
