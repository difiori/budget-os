import { addMonths, type CalendarDate, isSameMonth } from "./calendar-date";
import { CICLO_PADRAO, mesDaFatura, type CicloCartao } from "./ciclo-cartao";
import { dataParaCalculo } from "./data-fallback";
import type { SaidaOrigem, SaidaParaCalculo, SaidaStatus } from "./types";

/** Índice contínuo de mês (ano*12 + mês) — pra comparar meses por ordem. */
function indiceMes(d: CalendarDate): number {
  return d.year * 12 + (d.month - 1);
}

/**
 * Regras 1-2: Fatura de M = soma das compras do cartão cuja data (ou fallback)
 * cai no ciclo de M, conforme o fechamento real do cartão (ver ciclo-cartao).
 * Sem ciclo, vale o padrão histórico: fecha no último dia do mês.
 */
export function faturaAtualCents(
  cartaoId: string,
  saidas: SaidaParaCalculo[],
  mesReferencia: CalendarDate,
  ciclo: CicloCartao = CICLO_PADRAO
): number {
  return saidas
    .filter((s) => s.cartao_id === cartaoId)
    .filter((s) => isSameMonth(mesDaFatura(dataParaCalculo(s), ciclo), mesReferencia))
    .reduce((sum, s) => sum + s.total_cents, 0);
}

/**
 * Limite comprometido = soma de `total_cents` das saídas do cartão ainda não
 * pagas que pesam no limite disponível hoje. Janela por fatura da compra
 * (`mesDaFatura`, mesmo critério das faturas do card):
 *
 * - **Sem passado**: ignora compras anteriores à fatura a vencer (mês anterior
 *   ao de referência). Lançamento vencido nunca quitado é dado antigo, não
 *   limite em uso.
 * - **Fatura a vencer (mês anterior)**: conta tudo, inclusive recorrentes
 *   (anuidade, assinatura). É a fatura fechada que vence agora — dívida real
 *   enquanto o botão "marcar como paga" não é pressionado.
 * - **Fatura do mês (atual)**: conta avulsas e parcelamentos, mas **não** as
 *   recorrentes — elas ainda não caíram no cartão, então reservá-las agora
 *   inflaria o "excedido" antes da hora. Passam a pesar quando este mês vira o
 *   "a vencer" (mês seguinte) ou quando a fatura é paga (aí são debitadas).
 * - **No futuro, só parcela**: dos meses à frente, apenas compras parceladas
 *   (`Parcelamento`) pesam — é a única dívida já assumida.
 */
export function limiteComprometidoCents(
  cartaoId: string,
  saidas: (SaidaParaCalculo & { status: SaidaStatus; origem: SaidaOrigem })[],
  mesReferencia: CalendarDate,
  ciclo: CicloCartao = CICLO_PADRAO
): number {
  const inicioCiclo = indiceMes(addMonths(mesReferencia, -1)); // fatura a vencer
  const fimCicloAtual = indiceMes(mesReferencia); // fatura do mês

  return saidas
    .filter((s) => s.cartao_id === cartaoId)
    .filter((s) => s.status !== "Pago")
    .filter((s) => {
      const ref = indiceMes(mesDaFatura(dataParaCalculo(s), ciclo));
      if (ref < inicioCiclo) return false; // sem passado
      if (ref > fimCicloAtual) return s.origem === "Parcelamento"; // futuro: só parcela
      if (ref === fimCicloAtual) return s.origem !== "Recorrente"; // do mês: avulsa + parcela (recorrente não)
      return true; // a vencer (mês anterior): tudo, inclusive recorrente
    })
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
