"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import { garantirOcorrenciasDoMes } from "@/lib/contas-fixas/garantir";
import { addMonths, parseCalendarDate, type CalendarDate } from "@/lib/domain/calendar-date";
import { mesISO, ocorrenciaPrevista } from "@/lib/domain/conta-fixa";
import type { MetodoPagamento, Pessoa } from "@/lib/domain/types";

type ActionResult = { error: string | null };

export interface ContaFixaInput {
  nome: string;
  totalCents: number;
  pessoa: Pessoa;
  metodo: MetodoPagamento;
  categoriaId: string | null;
  contaId: string | null;
  cartaoId: string | null;
  diaVencimento: number;
  /** Mês de início (dia ignorado). */
  inicio: Pick<CalendarDate, "year" | "month">;
  observacao?: string | null;
}

function revalidar() {
  for (const p of ["/contas-fixas", "/", "/lancamentos", "/cartoes", "/mes", "/categorias", "/contas"]) revalidatePath(p);
}

function validar(input: ContaFixaInput): string | null {
  if (!input.nome.trim()) return "Informe o nome da conta fixa.";
  if (!Number.isInteger(input.totalCents) || input.totalCents === 0) return "Informe o valor.";
  if (!Number.isInteger(input.diaVencimento) || input.diaVencimento < 1 || input.diaVencimento > 31) return "Dia inválido (1 a 31).";
  if (input.metodo === "Débito" && !input.contaId) return "Selecione a conta.";
  if (input.metodo === "Crédito" && !input.cartaoId) return "Selecione o cartão.";
  return null;
}

/** Colunas do contrato a partir do input (conta XOR cartão conforme o método). */
function colunas(input: ContaFixaInput, editadoPor: Pessoa) {
  return {
    nome: input.nome.trim(),
    total_cents: input.totalCents,
    pessoa: input.pessoa,
    metodo: input.metodo,
    categoria_id: input.categoriaId,
    conta_id: input.metodo === "Débito" ? input.contaId : null,
    cartao_id: input.metodo === "Crédito" ? input.cartaoId : null,
    dia_vencimento: input.diaVencimento,
    observacao: input.observacao?.trim() || null,
    editado_por: editadoPor,
    atualizado_em: new Date().toISOString(),
  };
}

async function editor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, editadoPor: pessoaPorEmail(user?.email) };
}

/** Cria o contrato e já materializa a ocorrência do mês aberto (se vigente). */
export async function criarContaFixa(input: ContaFixaInput, mesAberto: CalendarDate): Promise<ActionResult> {
  const erro = validar(input);
  if (erro) return { error: erro };
  const { supabase, editadoPor } = await editor();
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { error } = await supabase
    .from("recorrente")
    .insert({ ...colunas(input, editadoPor), inicio: mesISO(input.inicio), fim: null, ativo: true });
  if (error) return { error: error.message };

  await garantirOcorrenciasDoMes(supabase, mesAberto);
  revalidar();
  return { error: null };
}

/**
 * Atualiza o contrato. Com `aplicarFuturas`, propaga nome, valor, método,
 * destino, categoria e dia para as ocorrências ainda NÃO pagas a partir do
 * mês indicado — as pagas são histórico e ficam como estão.
 */
export async function atualizarContaFixa(
  id: string,
  input: ContaFixaInput,
  opcoes: { aplicarFuturas: boolean; aPartirDe: CalendarDate }
): Promise<ActionResult> {
  const erro = validar(input);
  if (erro) return { error: erro };
  const { supabase, editadoPor } = await editor();
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { error } = await supabase
    .from("recorrente")
    .update({ ...colunas(input, editadoPor), inicio: mesISO(input.inicio) })
    .eq("id", id);
  if (error) return { error: error.message };

  if (opcoes.aplicarFuturas) {
    const { data: futuras, error: selErr } = await supabase
      .from("saida")
      .select("id, data")
      .eq("recorrente_id", id)
      .neq("status", "Pago")
      .gte("data", mesISO(opcoes.aPartirDe));
    if (selErr) return { error: `Contrato salvo, mas não foi possível ler as ocorrências: ${selErr.message}` };

    for (const s of (futuras ?? []) as { id: string; data: string }[]) {
      const mes = parseCalendarDate(s.data);
      const prev = ocorrenciaPrevista(
        { dia_vencimento: input.diaVencimento, metodo: input.metodo, total_cents: input.totalCents },
        { year: mes.year, month: mes.month, day: 1 }
      );
      const { error: upErr } = await supabase
        .from("saida")
        .update({
          nome: input.nome.trim(),
          total_cents: input.totalCents,
          metodo: input.metodo,
          categoria_id: input.categoriaId,
          conta_id: input.metodo === "Débito" ? input.contaId : null,
          cartao_id: input.metodo === "Crédito" ? input.cartaoId : null,
          data: prev.data,
          vencimento: prev.vencimento,
          editado_por: editadoPor,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", s.id);
      if (upErr) return { error: `Contrato salvo, mas uma ocorrência falhou: ${upErr.message}` };
    }
  }

  revalidar();
  return { error: null };
}

/**
 * Encerra o contrato tendo `ultimoMes` como último mês válido: desativa, grava
 * o fim e remove as ocorrências posteriores ainda não pagas. Nada pago é
 * tocado.
 */
export async function encerrarContaFixa(
  id: string,
  ultimoMes: CalendarDate
): Promise<ActionResult & { removidas: number }> {
  const { supabase, editadoPor } = await editor();
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando.", removidas: 0 };

  const { error } = await supabase
    .from("recorrente")
    .update({ ativo: false, fim: mesISO(ultimoMes), editado_por: editadoPor, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message, removidas: 0 };

  const { data: removidas, error: delErr } = await supabase
    .from("saida")
    .delete()
    .eq("recorrente_id", id)
    .neq("status", "Pago")
    .gte("data", mesISO(addMonths({ ...ultimoMes, day: 1 }, 1)))
    .select("id");
  if (delErr) return { error: `Contrato encerrado, mas as ocorrências futuras não foram removidas: ${delErr.message}`, removidas: 0 };

  revalidar();
  return { error: null, removidas: removidas?.length ?? 0 };
}

/** Reativa um contrato encerrado (sem fim) e materializa o mês aberto. */
export async function reativarContaFixa(id: string, mesAberto: CalendarDate): Promise<ActionResult> {
  const { supabase, editadoPor } = await editor();
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };
  const { error } = await supabase
    .from("recorrente")
    .update({ ativo: true, fim: null, editado_por: editadoPor, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  await garantirOcorrenciasDoMes(supabase, mesAberto);
  revalidar();
  return { error: null };
}

/** Exclui um contrato SEM histórico (nenhuma ocorrência). Com histórico, encerre. */
export async function excluirContaFixa(id: string): Promise<ActionResult> {
  const { supabase } = await editor();
  const { count, error: cntErr } = await supabase
    .from("saida")
    .select("id", { count: "exact", head: true })
    .eq("recorrente_id", id);
  if (cntErr) return { error: cntErr.message };
  if ((count ?? 0) > 0) return { error: "Esta conta fixa tem lançamentos. Encerre em vez de excluir." };
  const { error } = await supabase.from("recorrente").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidar();
  return { error: null };
}
