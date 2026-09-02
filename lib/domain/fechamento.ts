import { type CalendarDate, isSameMonth, parseCalendarDate } from "./calendar-date";
import type { Entrada, Saida } from "./types";

/**
 * Fechamento do mês: leituras comparativas (contra o mês anterior), fixas x
 * variáveis e maiores movimentos. Base de saída = vencimento (regra 4), de
 * entrada = data — a mesma do Painel e das Categorias.
 */

export interface Variacao {
  /** Diferença absoluta (atual − anterior), em centavos. */
  abs: number;
  /** Variação percentual; null quando não há base (anterior = 0). */
  pct: number | null;
}

export function variacao(atual: number, anterior: number): Variacao {
  const abs = atual - anterior;
  return { abs, pct: anterior === 0 ? null : (abs / Math.abs(anterior)) * 100 };
}

/** Quanto das entradas sobrou: (entradas − saídas) / entradas. null sem entradas. */
export function taxaPoupancaPct(entradas: number, saidas: number): number | null {
  if (entradas <= 0) return null;
  return ((entradas - saidas) / entradas) * 100;
}

type SaidaMes = Pick<Saida, "total_cents" | "vencimento" | "categoria_id" | "recorrente_id" | "nome" | "data" | "pessoa" | "metodo" | "id">;

export function saidasComVencimentoNoMes<T extends Pick<Saida, "vencimento">>(saidas: T[], mes: CalendarDate): T[] {
  return saidas.filter((s) => s.vencimento !== null && isSameMonth(parseCalendarDate(s.vencimento), mes));
}

export function entradasNoMes<T extends Pick<Entrada, "data">>(entradas: T[], mes: CalendarDate): T[] {
  return entradas.filter((e) => isSameMonth(parseCalendarDate(e.data), mes));
}

/** Saídas do mês divididas entre contas fixas (com contrato) e avulsas. */
export function fixasVsVariaveis(saidasDoMes: Pick<Saida, "total_cents" | "recorrente_id">[]): {
  fixas: number;
  variaveis: number;
  nFixas: number;
  nVariaveis: number;
} {
  let fixas = 0;
  let variaveis = 0;
  let nFixas = 0;
  let nVariaveis = 0;
  for (const s of saidasDoMes) {
    if (s.recorrente_id) {
      fixas += s.total_cents;
      nFixas += 1;
    } else {
      variaveis += s.total_cents;
      nVariaveis += 1;
    }
  }
  return { fixas, variaveis, nFixas, nVariaveis };
}

export interface LinhaCategoriaComparada {
  /** null = sem categoria. */
  categoriaId: string | null;
  atual: number;
  anterior: number;
  variacao: Variacao;
}

/** Total por categoria no mês atual e no anterior, ordenado pelo atual. */
export function categoriasComparadas(
  saidasAtual: Pick<Saida, "total_cents" | "categoria_id">[],
  saidasAnterior: Pick<Saida, "total_cents" | "categoria_id">[]
): LinhaCategoriaComparada[] {
  const mapa = new Map<string | null, { atual: number; anterior: number }>();
  const add = (lista: Pick<Saida, "total_cents" | "categoria_id">[], campo: "atual" | "anterior") => {
    for (const s of lista) {
      const k = s.categoria_id ?? null;
      const atual = mapa.get(k) ?? { atual: 0, anterior: 0 };
      atual[campo] += s.total_cents;
      mapa.set(k, atual);
    }
  };
  add(saidasAtual, "atual");
  add(saidasAnterior, "anterior");
  return [...mapa.entries()]
    .map(([categoriaId, v]) => ({ categoriaId, atual: v.atual, anterior: v.anterior, variacao: variacao(v.atual, v.anterior) }))
    .sort((a, b) => b.atual - a.atual || b.anterior - a.anterior);
}

/** As N maiores saídas do mês, da maior para a menor. */
export function maioresSaidas<T extends Pick<Saida, "total_cents">>(saidasDoMes: T[], n: number): T[] {
  return [...saidasDoMes].sort((a, b) => b.total_cents - a.total_cents).slice(0, n);
}

export type { SaidaMes };
