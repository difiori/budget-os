import type { CalendarDate } from "./calendar-date";
import { CICLO_PADRAO, mesDaFatura, vencimentoDaFatura, type CicloCartao } from "./ciclo-cartao";
import type { MetodoPagamento } from "./types";

/**
 * Regra 7: Débito vence na própria data (liquidação imediata). Crédito vence
 * com a fatura em que a compra cai, conforme o ciclo do cartão (fechamento e
 * vencimento reais). Sem ciclo informado, vale o padrão histórico: fecha no
 * último dia do mês e vence dia 10 do seguinte.
 */
export function calcularVencimento(
  data: CalendarDate,
  metodo: MetodoPagamento,
  ciclo: CicloCartao = CICLO_PADRAO
): CalendarDate {
  if (metodo === "Crédito") {
    return vencimentoDaFatura(mesDaFatura(data, ciclo), ciclo);
  }
  return data;
}
