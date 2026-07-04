import { type CalendarDate, addMonths, formatCalendarDateISO } from "./calendar-date";
import { calcularVencimento } from "./vencimento";
import type { MetodoPagamento, Pessoa, SaidaStatus } from "./types";

/**
 * Nome para exibição junto da parcela, sem duplicar. Parcelamentos gravam o
 * sufixo "NN/NN" dentro do próprio `nome` (ver gerarParcelas) e também no campo
 * `parcela`; então, se o nome já termina com esse sufixo, não repetimos. Já
 * lançamentos importados costumam ter só o `parcela` preenchido, sem sufixo no
 * nome — nesses, anexamos " · NN/NN".
 */
export function nomeComParcela(nome: string, parcela: string | null | undefined): string {
  if (!parcela) return nome;
  return nome.trimEnd().endsWith(parcela) ? nome : `${nome} · ${parcela}`;
}

/** Inverso do acima: o nome sem o sufixo "NN/NN" (para pré-preencher a edição
 * com o nome base, sem repetir a parcela que já aparece no campo próprio). */
export function nomeSemParcela(nome: string, parcela: string | null | undefined): string {
  if (!parcela) return nome;
  const limpo = nome.trimEnd();
  return limpo.endsWith(parcela) ? limpo.slice(0, -parcela.length).trimEnd() : nome;
}

export interface CompraParcelada {
  nome: string;
  totalCents: number;
  numeroParcelas: number;
  data: CalendarDate;
  pessoa: Pessoa;
  metodo: MetodoPagamento;
  status: SaidaStatus;
  cartaoId: string;
  categoriaId: string | null;
}

export interface ParcelaGerada {
  nome: string;
  total_cents: number;
  data: string;
  vencimento: string;
  pessoa: Pessoa;
  metodo: MetodoPagamento;
  status: SaidaStatus;
  origem: "Parcelamento";
  cartao_id: string;
  conta_id: null;
  categoria_id: string | null;
  parcela: string;
}

/**
 * Regra 5: gera N saídas no ato do lançamento parcelado.
 * - valor = total/N com ajuste de centavos na última parcela
 * - nome "X 01/N"…"X NN/N" com zero à esquerda
 * - data da parcela i = data da compra + (i-1) meses
 * - vencimento = dia 10 do mês seguinte à data da própria parcela
 */
export function gerarParcelas(compra: CompraParcelada): ParcelaGerada[] {
  const { numeroParcelas, totalCents } = compra;
  if (numeroParcelas < 1) {
    throw new Error("Número de parcelas deve ser >= 1");
  }

  const valorBase = Math.floor(totalCents / numeroParcelas);
  const ajusteUltima = totalCents - valorBase * (numeroParcelas - 1);
  const largura = Math.max(2, String(numeroParcelas).length);

  return Array.from({ length: numeroParcelas }, (_, index) => {
    const numero = index + 1;
    const isUltima = numero === numeroParcelas;
    const valorCents = isUltima ? ajusteUltima : valorBase;
    const dataParcela = addMonths(compra.data, index);
    const vencimento = calcularVencimento(dataParcela, compra.metodo);
    const numeroFormatado = String(numero).padStart(largura, "0");
    const totalFormatado = String(numeroParcelas).padStart(largura, "0");

    return {
      nome: `${compra.nome} ${numeroFormatado}/${totalFormatado}`,
      total_cents: valorCents,
      data: formatCalendarDateISO(dataParcela),
      vencimento: formatCalendarDateISO(vencimento),
      pessoa: compra.pessoa,
      metodo: compra.metodo,
      status: compra.status,
      origem: "Parcelamento",
      cartao_id: compra.cartaoId,
      conta_id: null,
      categoria_id: compra.categoriaId,
      parcela: `${numeroFormatado}/${totalFormatado}`,
    };
  });
}
