import { type CalendarDate, isSameMonth } from "./calendar-date";
import { dataParaCalculo } from "./data-fallback";
import type { SaidaParaCalculo, SaidaStatus } from "./types";

/**
 * Regras 1-2: ciclo de fatura = mês-calendário (fecha no último dia do mês,
 * vence dia 10 do mês seguinte — ver vencimento.ts). Fatura Atual = soma de
 * `total_cents` das saídas do cartão com `data` (ou fallback) no mês de
 * referência.
 */
export function faturaAtualCents(
  cartaoId: string,
  saidas: SaidaParaCalculo[],
  mesReferencia: CalendarDate
): number {
  return saidas
    .filter((s) => s.cartao_id === cartaoId)
    .filter((s) => isSameMonth(dataParaCalculo(s), mesReferencia))
    .reduce((sum, s) => sum + s.total_cents, 0);
}

/**
 * Limite comprometido = soma de `total_cents` de todas as saídas do cartão
 * ainda não pagas, em qualquer mês (não só o ciclo atual). Uma compra
 * parcelada compromete o limite pelo valor total desde o ato da compra —
 * cada parcela ainda não paga soma integralmente aqui, não só a do mês.
 */
export function limiteComprometidoCents(
  cartaoId: string,
  saidas: (SaidaParaCalculo & { status: SaidaStatus })[]
): number {
  return saidas
    .filter((s) => s.cartao_id === cartaoId)
    .filter((s) => s.status !== "Pago")
    .reduce((sum, s) => sum + s.total_cents, 0);
}

/** Limite Disponível = limite - limite comprometido. `null` quando o cartão não tem limite. */
export function limiteDisponivelCents(
  limiteCents: number | null,
  comprometido: number
): number | null {
  if (limiteCents === null) return null;
  return limiteCents - comprometido;
}
