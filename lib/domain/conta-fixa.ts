import {
  type CalendarDate,
  daysInMonth,
  formatCalendarDateISO,
  isSameMonth,
  parseCalendarDate,
} from "./calendar-date";
import { CICLO_PADRAO, type CicloCartao } from "./ciclo-cartao";
import { calcularVencimento } from "./vencimento";
import type { ContaFixa, MetodoPagamento, Pessoa, SaidaParaCalculo, SaidaStatus } from "./types";

/** 1º dia do mês em ISO — formato de `inicio`/`fim` do contrato. */
export function mesISO(mes: Pick<CalendarDate, "year" | "month">): string {
  return formatCalendarDateISO({ year: mes.year, month: mes.month, day: 1 });
}

/** Contrato vale no mês: ativo, já começou e (se tem fim) ainda não acabou. */
export function vigenteNoMes(cf: Pick<ContaFixa, "ativo" | "inicio" | "fim">, mes: CalendarDate): boolean {
  if (!cf.ativo) return false;
  const m = mesISO(mes);
  return cf.inicio <= m && (cf.fim === null || cf.fim >= m);
}

/** Data da cobrança e vencimento previstos de um contrato num mês (mesma
 * regra da RPC `garantir_ocorrencias_contas_fixas`): dia limitado ao último
 * dia do mês; vencimento pela regra 7 do método, com o ciclo do cartão. */
export function ocorrenciaPrevista(
  cf: Pick<ContaFixa, "dia_vencimento" | "metodo" | "total_cents">,
  mes: CalendarDate,
  ciclo: CicloCartao = CICLO_PADRAO
): { data: string; vencimento: string; total_cents: number } {
  const data: CalendarDate = {
    year: mes.year,
    month: mes.month,
    day: Math.min(cf.dia_vencimento, daysInMonth(mes.year, mes.month)),
  };
  return {
    data: formatCalendarDateISO(data),
    vencimento: formatCalendarDateISO(calcularVencimento(data, cf.metodo, ciclo)),
    total_cents: cf.total_cents,
  };
}

export type SaidaVirtual = SaidaParaCalculo & {
  metodo: MetodoPagamento;
  status: SaidaStatus;
  pessoa: Pessoa;
  recorrente_id: string;
  virtual: true;
};

type SaidaComContrato = Pick<SaidaParaCalculo, "data" | "created_at"> & { recorrente_id?: string | null };

/**
 * Ocorrências que os contratos vigentes ainda NÃO têm materializadas nos
 * meses pedidos. A geração só grava o mês que alguém abriu; para a projeção
 * e o "a pagar" de meses futuros não abertos, o cálculo soma estas virtuais
 * como se já existissem (status "A pagar"), sem escrever nada no banco.
 */
export function ocorrenciasVirtuais(
  contratos: ContaFixa[],
  saidas: SaidaComContrato[],
  meses: CalendarDate[],
  cicloPorCartaoId: Map<string, CicloCartao> = new Map()
): SaidaVirtual[] {
  const materializadas = new Set<string>();
  for (const s of saidas) {
    if (!s.recorrente_id || !s.data) continue;
    const d = parseCalendarDate(s.data);
    materializadas.add(`${s.recorrente_id}|${d.year}-${d.month}`);
  }
  const virtuais: SaidaVirtual[] = [];
  for (const mes of meses) {
    for (const cf of contratos) {
      if (!vigenteNoMes(cf, mes)) continue;
      if (materializadas.has(`${cf.id}|${mes.year}-${mes.month}`)) continue;
      const prev = ocorrenciaPrevista(cf, mes, cf.cartao_id ? cicloPorCartaoId.get(cf.cartao_id) : undefined);
      virtuais.push({
        total_cents: prev.total_cents,
        data: prev.data,
        vencimento: prev.vencimento,
        created_at: "",
        conta_id: cf.conta_id,
        cartao_id: cf.cartao_id,
        metodo: cf.metodo,
        status: "A pagar",
        pessoa: cf.pessoa,
        recorrente_id: cf.id,
        virtual: true,
      });
    }
  }
  return virtuais;
}

/** Total previsto dos contratos vigentes no mês. */
export function totalPrevistoMes(contratos: ContaFixa[], mes: CalendarDate): number {
  return contratos.filter((cf) => vigenteNoMes(cf, mes)).reduce((sum, cf) => sum + cf.total_cents, 0);
}

/** Ocorrência materializada de um contrato num mês, se houver. */
export function ocorrenciaDoMes<T extends SaidaComContrato>(saidas: T[], contratoId: string, mes: CalendarDate): T | null {
  return (
    saidas.find(
      (s) => s.recorrente_id === contratoId && !!s.data && isSameMonth(parseCalendarDate(s.data), mes)
    ) ?? null
  );
}

/** Dias até a cobrança (negativo = já passou). */
export function diasAte(dataISO: string, hoje: CalendarDate): number {
  const d = parseCalendarDate(dataISO);
  const a = Date.UTC(d.year, d.month - 1, d.day);
  const b = Date.UTC(hoje.year, hoje.month - 1, hoje.day);
  return Math.round((a - b) / 86_400_000);
}
