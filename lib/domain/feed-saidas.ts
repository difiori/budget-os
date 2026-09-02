import { type CalendarDate, compareCalendarDates, isSameMonth } from "./calendar-date";
import { dataParaCalculo } from "./data-fallback";
import { nomeSemParcela } from "./parcelamento";
import type { Saida } from "./types";

/**
 * Feed "Últimas saídas" do Painel.
 *
 * O feed é um recorte do MÊS em foco pela data da compra (regra 3: `data`,
 * ou `created_at` quando nula), ordenado por padrão pela data de registro.
 * Recortar por mês é o que impede um parcelamento em 12x ou uma recorrência
 * lançados hoje de despejarem as 12 ocorrências futuras na lista de setembro:
 * cada ocorrência aparece só no mês da própria `data`.
 */

export type CampoOrdenacaoFeed = "registro" | "data" | "valor" | "categoria" | "nome";

export interface OrdenacaoFeed {
  campo: CampoOrdenacaoFeed;
  direcao: "asc" | "desc";
}

export const ORDENACAO_FEED_PADRAO: OrdenacaoFeed = { campo: "registro", direcao: "desc" };

type SaidaComData = Pick<Saida, "data" | "created_at">;

/** Saídas cuja data da compra cai no mês de referência. */
export function saidasDoMesPorData<T extends SaidaComData>(saidas: T[], mesReferencia: CalendarDate): T[] {
  return saidas.filter((s) => isSameMonth(dataParaCalculo(s), mesReferencia));
}

/** Compra com data depois de hoje ainda não aconteceu (ocorrência futura de
 * recorrência/parcelamento, ou lançamento pré-datado). */
export function isSaidaFutura(saida: SaidaComData, hoje: CalendarDate): boolean {
  return compareCalendarDates(dataParaCalculo(saida), hoje) > 0;
}

/**
 * Resumo do lançamento que originou a saída, quando ela nasceu junto com
 * irmãs (parcelamento ou recorrência inseridos de uma vez — mesmo
 * `created_at`). Serve pra linha dizer "3/12 · total R$ 1.200" ou
 * "recorrente até ago/2027" sem listar as irmãs.
 */
export type ResumoLancamento =
  | { tipo: "parcelado"; parcelas: number; totalCents: number }
  | { tipo: "recorrente"; ocorrencias: number; ultimaData: CalendarDate };

type SaidaParaResumo = Pick<
  Saida,
  "id" | "nome" | "parcela" | "origem" | "pessoa" | "created_at" | "total_cents" | "data" | "cartao_id" | "conta_id"
>;

function denominadorParcela(parcela: string | null): number | null {
  if (!parcela) return null;
  const match = /^\s*\d+\s*\/\s*(\d+)\s*$/.exec(parcela);
  return match ? Number(match[1]) : null;
}

function chaveIrmas(s: SaidaParaResumo, base: string): string {
  return [s.origem, s.pessoa, s.created_at, s.cartao_id ?? "", s.conta_id ?? "", base].join("|");
}

/** Mapa id → resumo, só para saídas parceladas ou recorrentes. */
export function resumirLancamentos(saidas: SaidaParaResumo[]): Map<string, ResumoLancamento> {
  const grupos = new Map<string, SaidaParaResumo[]>();
  for (const s of saidas) {
    const parcelas = denominadorParcela(s.parcela);
    const parcelada = parcelas !== null && parcelas > 1;
    if (!parcelada && s.origem !== "Recorrente") continue;
    const base = parcelada ? nomeSemParcela(s.nome, s.parcela) : s.nome;
    const chave = chaveIrmas(s, base);
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(s);
    else grupos.set(chave, [s]);
  }

  const resumos = new Map<string, ResumoLancamento>();
  for (const grupo of grupos.values()) {
    const [primeira] = grupo;
    const parcelas = denominadorParcela(primeira.parcela);
    if (parcelas !== null && parcelas > 1) {
      // Só conta irmãs que declaram o mesmo total de parcelas, e nunca mais
      // que N — protege contra colisões de created_at da importação em lote.
      const irmas = grupo.filter((s) => denominadorParcela(s.parcela) === parcelas).slice(0, parcelas);
      const totalCents = irmas.reduce((sum, s) => sum + s.total_cents, 0);
      for (const s of grupo) resumos.set(s.id, { tipo: "parcelado", parcelas, totalCents });
      continue;
    }
    const ultimaData = grupo
      .map((s) => dataParaCalculo(s))
      .reduce((max, d) => (compareCalendarDates(d, max) > 0 ? d : max));
    for (const s of grupo) resumos.set(s.id, { tipo: "recorrente", ocorrencias: grupo.length, ultimaData });
  }
  return resumos;
}

type SaidaOrdenavel = Pick<Saida, "nome" | "total_cents" | "created_at" | "data" | "categoria_id">;

/** Ordena o feed; empate sempre resolve pelo registro mais novo primeiro. */
export function ordenarFeed<T extends SaidaOrdenavel>(
  saidas: T[],
  ordenacao: OrdenacaoFeed,
  categoriaNome: (categoriaId: string | null) => string
): T[] {
  const mult = ordenacao.direcao === "asc" ? 1 : -1;
  const porRegistro = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  return [...saidas].sort((a, b) => {
    let cmp = 0;
    switch (ordenacao.campo) {
      case "valor":
        cmp = a.total_cents - b.total_cents;
        break;
      case "nome":
        cmp = a.nome.localeCompare(b.nome, "pt-BR");
        break;
      case "categoria":
        cmp = categoriaNome(a.categoria_id).localeCompare(categoriaNome(b.categoria_id), "pt-BR");
        break;
      case "data":
        cmp = compareCalendarDates(dataParaCalculo(a), dataParaCalculo(b));
        break;
      case "registro":
        cmp = a.created_at.localeCompare(b.created_at);
        break;
    }
    return cmp !== 0 ? cmp * mult : porRegistro(a, b);
  });
}

export function totalCentsDoFeed(saidas: Pick<Saida, "total_cents">[]): number {
  return saidas.reduce((sum, s) => sum + s.total_cents, 0);
}
