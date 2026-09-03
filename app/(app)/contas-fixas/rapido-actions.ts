"use server";

import { createClient } from "@/lib/supabase/server";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { garantirOcorrenciasDoMes } from "@/lib/contas-fixas/garantir";
import { atualizarSaida } from "@/app/(app)/lancamentos/actions";
import { formatCalendarDateISO, parseCalendarDate } from "@/lib/domain/calendar-date";
import { cicloDoCartao, mesDaFatura, vencimentoDaFatura } from "@/lib/domain/ciclo-cartao";
import { normalizar } from "@/lib/lancar/interpretar-local";
import { labelMes } from "@/lib/format/meses";
import type { MetodoPagamento, SaidaStatus } from "@/lib/domain/types";

/** Situação de uma conta fixa num mês, para o Lançar rápido agir sem sair do diálogo. */
export interface SituacaoFixa {
  contratoId: string;
  nome: string;
  metodo: MetodoPagamento;
  previstoCents: number;
  mesLabel: string;
  ocorrencia: { id: string; totalCents: number; status: SaidaStatus; data: string } | null;
  /** Crédito: "Fatura de outubro · vence 10/10". */
  faturaLabel: string | null;
}

export type ResultadoSituacao = { ok: true; situacao: SituacaoFixa } | { ok: false; error: string };

/**
 * "paguei 320 de luz da mãe" → qual contrato, qual ocorrência do mês da data,
 * e em que estado. Abre o mês (materializa as ocorrências, idempotente) se
 * ainda não estava aberto — pagar o mês é abrir o mês.
 */
export async function situacaoContaFixa(nome: string, dataISO: string): Promise<ResultadoSituacao> {
  const supabase = await createClient();
  const pessoa = await pessoaAtiva();
  const { data: contratos } = await supabase
    .from("recorrente")
    .select("id, nome, metodo, total_cents, cartao_id, ativo, fim")
    .eq("pessoa", pessoa)
    .eq("ativo", true);
  const alvo = normalizar(nome);
  const lista = (contratos ?? []) as { id: string; nome: string; metodo: MetodoPagamento; total_cents: number; cartao_id: string | null; fim: string | null }[];
  const contrato = lista.find((c) => normalizar(c.nome) === alvo) ?? lista.find((c) => normalizar(c.nome).startsWith(alvo) || alvo.startsWith(normalizar(c.nome)));
  if (!contrato) return { ok: false, error: `Não achei a conta fixa "${nome}" entre as ativas de ${pessoa}.` };

  let mes;
  try {
    mes = parseCalendarDate(/^\d{4}-\d{2}-\d{2}$/.test(dataISO) ? dataISO : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
  } catch {
    return { ok: false, error: "Data inválida." };
  }
  await garantirOcorrenciasDoMes(supabase, mes);
  const inicio = formatCalendarDateISO({ year: mes.year, month: mes.month, day: 1 });
  const fim = formatCalendarDateISO({ year: mes.year, month: mes.month, day: 31 > 28 ? new Date(Date.UTC(mes.year, mes.month, 0)).getUTCDate() : 28 });
  const { data: oc } = await supabase
    .from("saida")
    .select("id, total_cents, status, data")
    .eq("recorrente_id", contrato.id)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data")
    .limit(1)
    .maybeSingle();

  let faturaLabel: string | null = null;
  if (contrato.metodo === "Crédito" && contrato.cartao_id) {
    const { data: cartao } = await supabase.from("cartao").select("dia_fechamento, dia_vencimento").eq("id", contrato.cartao_id).maybeSingle();
    if (cartao && oc?.data) {
      const ciclo = cicloDoCartao(cartao as { dia_fechamento: number; dia_vencimento: number });
      const mesFatura = mesDaFatura(parseCalendarDate(oc.data as string), ciclo);
      const venc = vencimentoDaFatura(mesFatura, ciclo);
      faturaLabel = `Fatura de ${labelMes(mesFatura)} · vence ${String(venc.day).padStart(2, "0")}/${String(venc.month).padStart(2, "0")}`;
    }
  }

  return {
    ok: true,
    situacao: {
      contratoId: contrato.id,
      nome: contrato.nome,
      metodo: contrato.metodo,
      previstoCents: contrato.total_cents,
      mesLabel: labelMes(mes),
      ocorrencia: oc ? { id: oc.id as string, totalCents: oc.total_cents as number, status: oc.status as SaidaStatus, data: oc.data as string } : null,
      faturaLabel,
    },
  };
}

/**
 * Ajusta o valor real do mês e/ou marca a ocorrência como paga — pela mesma
 * ação que a tela de Contas fixas usa, então saldo e revalidação seguem iguais.
 */
export async function pagarContaFixaRapido(input: { ocorrenciaId: string; valorCents: number; marcarPago: boolean }): Promise<{ error: string | null; resumo: string | null }> {
  if (!Number.isInteger(input.valorCents) || input.valorCents <= 0) return { error: "Valor inválido.", resumo: null };
  const supabase = await createClient();
  const { data: oc, error } = await supabase
    .from("saida")
    .select("id, nome, total_cents, data, vencimento, parcela, categoria_id, status, metodo, conta_id, cartao_id")
    .eq("id", input.ocorrenciaId)
    .single();
  if (error || !oc) return { error: error?.message ?? "Ocorrência não encontrada.", resumo: null };

  const statusAnterior = oc.status as SaidaStatus;
  const metodo = oc.metodo as MetodoPagamento;
  const novoStatus: SaidaStatus = input.marcarPago && metodo === "Débito" ? "Pago" : statusAnterior;
  const mudouValor = input.valorCents !== (oc.total_cents as number);
  if (!mudouValor && novoStatus === statusAnterior) return { error: null, resumo: "Já estava assim." };

  const r = await atualizarSaida({
    id: oc.id as string,
    nome: oc.nome as string,
    totalCents: input.valorCents,
    data: (oc.data as string) ?? "",
    vencimento: (oc.vencimento as string) ?? "",
    parcela: oc.parcela as string | null,
    categoriaId: oc.categoria_id as string | null,
    status: novoStatus,
    statusAnterior,
    totalCentsAnterior: oc.total_cents as number,
    metodo,
    contaId: oc.conta_id as string | null,
    cartaoId: oc.cartao_id as string | null,
  });
  if (r.error) return { error: r.error, resumo: null };
  const partes: string[] = [];
  if (mudouValor) partes.push("valor ajustado");
  if (novoStatus !== statusAnterior) partes.push("marcada como paga");
  return { error: null, resumo: partes.join(" e ") };
}
