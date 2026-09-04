import type { CalendarDate } from "@/lib/domain/calendar-date";
import { mesDeCobranca, type CicloCartao } from "@/lib/domain/ciclo-cartao";
import { MESES } from "./meses";

/**
 * "Fatura de Outubro" para a fatura cujo ciclo é setembro: a interface chama
 * a fatura pelo mês em que ela é paga, como o banco faz. `minusculo` para
 * frases correntes ("fatura de outubro · vence 10/10").
 */
export function tituloFatura(mesFatura: Pick<CalendarDate, "year" | "month">, ciclo: CicloCartao, opts: { minusculo?: boolean } = {}): string {
  const nome = MESES[mesDeCobranca(mesFatura, ciclo).month - 1];
  return `Fatura de ${opts.minusculo ? nome.toLowerCase() : nome}`;
}
