import { type CalendarDate, parseCalendarDate } from "./calendar-date";
import type { Saida } from "./types";

function indiceMes(d: CalendarDate): number {
  return d.year * 12 + d.month;
}

export interface CompraParcelada {
  nomeBase: string;
  cartaoId: string;
  parcelas: Saida[];
}

const SUFIXO_PARCELA = /\s+\d{2,}\/\d{2,}$/;

/** Agrupa saídas de origem Parcelamento pela compra original: mesmo cartão +
 * mesmo nome sem o sufixo "NN/NN". */
export function agruparParcelas(saidas: Saida[]): CompraParcelada[] {
  const grupos = new Map<string, CompraParcelada>();
  for (const s of saidas) {
    if (s.origem !== "Parcelamento" || !s.cartao_id) continue;
    const nomeBase = s.nome.replace(SUFIXO_PARCELA, "").trim();
    const chave = `${s.cartao_id}::${nomeBase}`;
    const grupo = grupos.get(chave) ?? { nomeBase, cartaoId: s.cartao_id, parcelas: [] };
    grupo.parcelas.push(s);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}

/** Parcelas do grupo com vencimento em mês depois do mês de referência, em ordem cronológica. */
export function parcelasFuturas(grupo: CompraParcelada, mesReferencia: CalendarDate): Saida[] {
  const indiceReferencia = indiceMes(mesReferencia);
  return grupo.parcelas
    .filter((s): s is Saida & { vencimento: string } => s.vencimento !== null)
    .filter((s) => indiceMes(parseCalendarDate(s.vencimento)) > indiceReferencia)
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
}
