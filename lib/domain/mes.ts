import { type CalendarDate, isSameMonth, parseCalendarDate } from "./calendar-date";
import type { Conta, EntradaStatus, MetodoPagamento, SaidaParaCalculo, SaidaStatus } from "./types";

interface EntradaParaCalculo {
  quantia_cents: number;
  data: string;
  conta_destino_id: string;
}

/** Regra 4: Gastos do Mês (conta) = soma das saídas da conta com `vencimento` no mês corrente. */
export function gastosDoMesCents(
  contaId: string,
  saidas: SaidaParaCalculo[],
  mesReferencia: CalendarDate
): number {
  return saidas
    .filter((s) => s.conta_id === contaId)
    .filter((s) => s.vencimento !== null)
    .filter((s) => isSameMonth(parseCalendarDate(s.vencimento as string), mesReferencia))
    .reduce((sum, s) => sum + s.total_cents, 0);
}

/** Regra 4: Entradas do Mês = soma das entradas da conta com `data` no mês corrente. */
export function entradasDoMesCents(
  contaId: string,
  entradas: EntradaParaCalculo[],
  mesReferencia: CalendarDate
): number {
  return entradas
    .filter((e) => e.conta_destino_id === contaId)
    .filter((e) => isSameMonth(parseCalendarDate(e.data), mesReferencia))
    .reduce((sum, e) => sum + e.quantia_cents, 0);
}

/**
 * Saídas do mês ainda A PAGAR (status ≠ "Pago") — o que ainda vai sair da
 * conta. Inclui faturas de cartão a vencer, que só viram "Pago" (e debitam a
 * conta) quando a fatura é marcada como paga. Uma vez paga, já está no
 * saldo_atual e some daqui — por isso não pode ser somada de novo no previsto.
 */
export function saidasAPagarDoMesCents(
  contaId: string,
  saidas: (SaidaParaCalculo & { status: SaidaStatus })[],
  mesReferencia: CalendarDate
): number {
  return saidas
    .filter((s) => s.conta_id === contaId)
    .filter((s) => s.status !== "Pago")
    .filter((s) => s.vencimento !== null)
    .filter((s) => isSameMonth(parseCalendarDate(s.vencimento as string), mesReferencia))
    .reduce((sum, s) => sum + s.total_cents, 0);
}

/**
 * Entradas do mês ainda A RECEBER (status ≠ "Recebido") — o que ainda vai
 * entrar. As já recebidas creditaram a conta e estão no saldo_atual, então não
 * entram no previsto (senão seriam contadas duas vezes).
 */
export function entradasAReceberDoMesCents(
  contaId: string,
  entradas: (EntradaParaCalculo & { status: EntradaStatus })[],
  mesReferencia: CalendarDate
): number {
  return entradas
    .filter((e) => e.conta_destino_id === contaId)
    .filter((e) => e.status !== "Recebido")
    .filter((e) => isSameMonth(parseCalendarDate(e.data), mesReferencia))
    .reduce((sum, e) => sum + e.quantia_cents, 0);
}

/**
 * Saldo Previsto = saldo_atual + a receber - a pagar. Parte do saldo real
 * (que já embute o que foi pago/recebido) e aplica só o que ainda falta
 * acontecer no mês, para não contar duas vezes o que já liquidou.
 */
export function saldoPrevistoCents(
  saldoAtualCents: number,
  entradasAReceber: number,
  saidasAPagar: number
): number {
  return saldoAtualCents + entradasAReceber - saidasAPagar;
}

/**
 * Compra no crédito não tem `conta_id` — só debita a conta vinculada ao
 * cartão quando a fatura vence. Pra entrar na conta certa em gastosDoMesCents,
 * resolve aqui a conta "efetiva" de cada saída antes de somar por conta.
 */
export function resolverContaEfetivaDaSaida(
  saida: { conta_id: string | null; cartao_id: string | null; metodo: MetodoPagamento },
  contaVinculadaPorCartaoId: Map<string, string | null>
): string | null {
  if (saida.metodo === "Débito") return saida.conta_id;
  return saida.cartao_id ? (contaVinculadaPorCartaoId.get(saida.cartao_id) ?? null) : null;
}

/**
 * Resumo de uma conta no mês: gastos, entradas e saldo previsto (regra 4),
 * já resolvendo compras no crédito pela conta vinculada ao cartão. Ponto
 * único de cálculo — não duplicar esta lógica em cada página.
 */
export function resumoContaMes(
  conta: Pick<Conta, "id" | "saldo_atual_cents">,
  saidas: (SaidaParaCalculo & { metodo: MetodoPagamento; status: SaidaStatus })[],
  entradas: (EntradaParaCalculo & { status: EntradaStatus })[],
  mesReferencia: CalendarDate,
  contaVinculadaPorCartaoId: Map<string, string | null>
): { gastos: number; entradasConta: number; aPagar: number; aReceber: number; saldoPrevisto: number } {
  const saidasComContaEfetiva = saidas.map((s) => ({
    ...s,
    conta_id: resolverContaEfetivaDaSaida(s, contaVinculadaPorCartaoId),
  }));
  // Movimento bruto do mês (tudo que vence/entra, pago ou não) — informativo.
  const gastos = gastosDoMesCents(conta.id, saidasComContaEfetiva, mesReferencia);
  const entradasConta = entradasDoMesCents(conta.id, entradas, mesReferencia);
  // Pendências que movem o previsto a partir do saldo real.
  const aPagar = saidasAPagarDoMesCents(conta.id, saidasComContaEfetiva, mesReferencia);
  const aReceber = entradasAReceberDoMesCents(conta.id, entradas, mesReferencia);
  return {
    gastos,
    entradasConta,
    aPagar,
    aReceber,
    saldoPrevisto: saldoPrevistoCents(conta.saldo_atual_cents, aReceber, aPagar),
  };
}

/**
 * Projeção de saldo total (soma das contas) mês a mês: cada mês encadeia a
 * partir do saldo previsto do mês anterior — só o primeiro mês usa o saldo
 * real da conta. Depende de parcelas/recorrências já lançadas (o app gera as
 * ocorrências futuras na criação), não é uma estimativa estatística.
 */
export function projecaoSaldoMeses(
  contas: Pick<Conta, "id" | "saldo_atual_cents">[],
  saidas: (SaidaParaCalculo & { metodo: MetodoPagamento; status: SaidaStatus })[],
  entradas: (EntradaParaCalculo & { status: EntradaStatus })[],
  meses: CalendarDate[],
  contaVinculadaPorCartaoId: Map<string, string | null>
): { mes: CalendarDate; saldoTotal: number }[] {
  const saldoPorConta = new Map(contas.map((c) => [c.id, c.saldo_atual_cents]));
  return meses.map((mes) => {
    let total = 0;
    for (const conta of contas) {
      const contaComSaldoCorrente = { id: conta.id, saldo_atual_cents: saldoPorConta.get(conta.id) ?? 0 };
      const { saldoPrevisto } = resumoContaMes(contaComSaldoCorrente, saidas, entradas, mes, contaVinculadaPorCartaoId);
      saldoPorConta.set(conta.id, saldoPrevisto);
      total += saldoPrevisto;
    }
    return { mes, saldoTotal: total };
  });
}
