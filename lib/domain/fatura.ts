import { addMonths, type CalendarDate, isSameMonth } from "./calendar-date";
import { dataParaCalculo } from "./data-fallback";
import type { SaidaOrigem, SaidaParaCalculo, SaidaStatus } from "./types";

/** Índice contínuo de mês (ano*12 + mês) — pra comparar meses por ordem. */
function indiceMes(d: CalendarDate): number {
  return d.year * 12 + (d.month - 1);
}

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
 * Limite comprometido = soma de `total_cents` das saídas do cartão ainda não
 * pagas que pesam no limite disponível hoje. Janela por mês da compra
 * (`dataParaCalculo`, mesmo critério das faturas do card):
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
  mesReferencia: CalendarDate
): number {
  const inicioCiclo = indiceMes(addMonths(mesReferencia, -1)); // fatura a vencer
  const fimCicloAtual = indiceMes(mesReferencia); // fatura do mês

  return saidas
    .filter((s) => s.cartao_id === cartaoId)
    .filter((s) => s.status !== "Pago")
    .filter((s) => {
      const ref = indiceMes(dataParaCalculo(s));
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
