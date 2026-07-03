import { type CalendarDate, addMonths, formatCalendarDateISO } from "./calendar-date";
import { calcularVencimento } from "./vencimento";
import type { EntradaStatus, MetodoPagamento, Pessoa, SaidaStatus } from "./types";

/** Horizonte padrão de geração — não é infinito; passado esse período o
 * usuário precisa relançar (ou, no futuro, uma tela dedicada de recorrentes
 * estende automaticamente). */
export const MESES_RECORRENCIA = 12;

export interface SaidaRecorrenteBase {
  nome: string;
  totalCents: number;
  data: CalendarDate;
  pessoa: Pessoa;
  metodo: MetodoPagamento;
  status: SaidaStatus;
  categoriaId: string | null;
  contaId: string | null;
  cartaoId: string | null;
}

export interface SaidaOcorrencia {
  nome: string;
  total_cents: number;
  data: string;
  vencimento: string;
  pessoa: Pessoa;
  metodo: MetodoPagamento;
  status: SaidaStatus;
  origem: "Recorrente";
  categoria_id: string | null;
  conta_id: string | null;
  cartao_id: string | null;
  parcela: null;
}

/**
 * Gera as próximas `numeroMeses` ocorrências de uma saída recorrente (ex.:
 * aluguel, assinatura). Diferente de parcelamento: o valor não é dividido,
 * se repete integral todo mês. Só a primeira ocorrência nasce com o status
 * escolhido pelo usuário — meses futuros ainda não aconteceram, então nascem
 * como "A pagar" (não é possível já ter pago uma conta de um mês que não
 * chegou).
 */
export function gerarSaidasRecorrentes(
  base: SaidaRecorrenteBase,
  numeroMeses: number = MESES_RECORRENCIA
): SaidaOcorrencia[] {
  if (numeroMeses < 1) {
    throw new Error("Número de meses deve ser >= 1");
  }

  return Array.from({ length: numeroMeses }, (_, index) => {
    const dataOcorrencia = addMonths(base.data, index);
    const vencimento = calcularVencimento(dataOcorrencia, base.metodo);
    return {
      nome: base.nome,
      total_cents: base.totalCents,
      data: formatCalendarDateISO(dataOcorrencia),
      vencimento: formatCalendarDateISO(vencimento),
      pessoa: base.pessoa,
      metodo: base.metodo,
      status: index === 0 ? base.status : "A pagar",
      origem: "Recorrente",
      categoria_id: base.categoriaId,
      conta_id: base.contaId,
      cartao_id: base.cartaoId,
      parcela: null,
    };
  });
}

export interface EntradaRecorrenteBase {
  nome: string;
  quantiaCents: number;
  data: CalendarDate;
  pessoa: Pessoa;
  status: EntradaStatus;
  contaDestinoId: string;
}

export interface EntradaOcorrencia {
  nome: string;
  quantia_cents: number;
  data: string;
  pessoa: Pessoa;
  status: EntradaStatus;
  conta_destino_id: string;
  origem: "Recorrente";
}

/** Mesma lógica de gerarSaidasRecorrentes, para entradas (ex.: salário). */
export function gerarEntradasRecorrentes(
  base: EntradaRecorrenteBase,
  numeroMeses: number = MESES_RECORRENCIA
): EntradaOcorrencia[] {
  if (numeroMeses < 1) {
    throw new Error("Número de meses deve ser >= 1");
  }

  return Array.from({ length: numeroMeses }, (_, index) => {
    const dataOcorrencia = addMonths(base.data, index);
    return {
      nome: base.nome,
      quantia_cents: base.quantiaCents,
      data: formatCalendarDateISO(dataOcorrencia),
      pessoa: base.pessoa,
      status: index === 0 ? base.status : "Não recebido",
      conta_destino_id: base.contaDestinoId,
      origem: "Recorrente",
    };
  });
}
