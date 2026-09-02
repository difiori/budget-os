"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calcularVencimento } from "@/lib/domain/vencimento";
import { formatCalendarDateISO } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";
import type { CicloCartao } from "@/lib/domain/ciclo-cartao";
import { parseCentsFromBRL } from "@/lib/domain/money";
import type { CartaoTipo, CategoriaDono, Pessoa } from "@/lib/domain/types";

type ActionResult = { error: string | null };

function mensagemErro(error: { code?: string; message: string }): string {
  if (error.code === "23503") {
    return "Não é possível excluir: existem lançamentos vinculados a este item.";
  }
  return error.message;
}

function parseLimite(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return parseCentsFromBRL(trimmed);
}

function parseDia(input: string, fallback: number): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 1 || value > 31) return fallback;
  return Math.round(value);
}

// --- conta ------------------------------------------------------------

export async function criarConta(formData: FormData): Promise<ActionResult> {
  const nome = String(formData.get("nome") ?? "").trim();
  const dono = String(formData.get("dono") ?? "") as Pessoa;
  const saldoInput = String(formData.get("saldo") ?? "0");
  const limiteInput = String(formData.get("limite") ?? "0");

  if (!nome) return { error: "Informe o nome da conta." };

  let saldoCents: number;
  let limiteCents: number;
  try {
    saldoCents = parseCentsFromBRL(saldoInput || "0");
    limiteCents = parseCentsFromBRL(limiteInput || "0");
  } catch {
    return { error: "Saldo ou limite inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conta")
    .insert({ nome, dono, saldo_atual_cents: saldoCents, limite_cheque_especial_cents: limiteCents });
  if (error) return { error: mensagemErro(error) };

  revalidatePath("/config");
  revalidatePath("/");
  revalidatePath("/mes");
  revalidatePath("/contas");
  return { error: null };
}

export async function atualizarConta(id: string, formData: FormData): Promise<ActionResult> {
  const nome = String(formData.get("nome") ?? "").trim();
  const dono = String(formData.get("dono") ?? "") as Pessoa;
  const saldoInput = String(formData.get("saldo") ?? "0");
  const limiteInput = String(formData.get("limite") ?? "0");

  if (!nome) return { error: "Informe o nome da conta." };

  let saldoCents: number;
  let limiteCents: number;
  try {
    saldoCents = parseCentsFromBRL(saldoInput || "0");
    limiteCents = parseCentsFromBRL(limiteInput || "0");
  } catch {
    return { error: "Saldo ou limite inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conta")
    .update({ nome, dono, saldo_atual_cents: saldoCents, limite_cheque_especial_cents: limiteCents })
    .eq("id", id);
  if (error) return { error: mensagemErro(error) };

  revalidatePath("/config");
  revalidatePath("/");
  revalidatePath("/mes");
  revalidatePath("/contas");
  return { error: null };
}

export async function excluirConta(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("conta").delete().eq("id", id);
  if (error) return { error: mensagemErro(error) };

  revalidatePath("/config");
  revalidatePath("/");
  revalidatePath("/mes");
  revalidatePath("/contas");
  return { error: null };
}

// --- cartao -------------------------------------------------------------

export async function criarCartao(formData: FormData): Promise<ActionResult> {
  const nome = String(formData.get("nome") ?? "").trim();
  const dono = String(formData.get("dono") ?? "") as Pessoa;
  const tipo = String(formData.get("tipo") ?? "") as CartaoTipo;
  const limiteInput = String(formData.get("limite") ?? "");
  const diaFechamento = parseDia(String(formData.get("diaFechamento") ?? ""), 31);
  const diaVencimento = parseDia(String(formData.get("diaVencimento") ?? ""), 10);
  const contaVinculadaId = String(formData.get("contaVinculadaId") ?? "") || null;

  if (!nome) return { error: "Informe o nome do cartão." };

  let limiteCents: number | null;
  try {
    limiteCents = parseLimite(limiteInput);
  } catch {
    return { error: "Limite inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cartao").insert({
    nome,
    dono,
    tipo,
    limite_cents: limiteCents,
    dia_fechamento: diaFechamento,
    dia_vencimento: diaVencimento,
    conta_vinculada_id: contaVinculadaId,
  });
  if (error) return { error: mensagemErro(error) };

  revalidatePath("/config");
  revalidatePath("/cartoes");
  revalidatePath("/lancar");
  revalidatePath("/contas");
  return { error: null };
}

export async function atualizarCartao(id: string, formData: FormData): Promise<ActionResult> {
  const nome = String(formData.get("nome") ?? "").trim();
  const dono = String(formData.get("dono") ?? "") as Pessoa;
  const tipo = String(formData.get("tipo") ?? "") as CartaoTipo;
  const limiteInput = String(formData.get("limite") ?? "");
  const diaFechamento = parseDia(String(formData.get("diaFechamento") ?? ""), 31);
  const diaVencimento = parseDia(String(formData.get("diaVencimento") ?? ""), 10);
  const contaVinculadaId = String(formData.get("contaVinculadaId") ?? "") || null;

  if (!nome) return { error: "Informe o nome do cartão." };

  let limiteCents: number | null;
  try {
    limiteCents = parseLimite(limiteInput);
  } catch {
    return { error: "Limite inválido." };
  }

  const supabase = await createClient();
  const { data: anterior } = await supabase.from("cartao").select("dia_fechamento, dia_vencimento").eq("id", id).single();
  const { error } = await supabase
    .from("cartao")
    .update({
      nome,
      dono,
      tipo,
      limite_cents: limiteCents,
      dia_fechamento: diaFechamento,
      dia_vencimento: diaVencimento,
      conta_vinculada_id: contaVinculadaId,
    })
    .eq("id", id);
  if (error) return { error: mensagemErro(error) };

  // Mudou o ciclo? As compras ainda não pagas passam a vencer com a fatura
  // certa. As pagas são histórico e ficam como estão.
  const cicloMudou = !anterior || anterior.dia_fechamento !== diaFechamento || anterior.dia_vencimento !== diaVencimento;
  if (cicloMudou) {
    const erroRecalc = await recalcularVencimentosDoCartao(supabase, id, { dia_fechamento: diaFechamento, dia_vencimento: diaVencimento });
    if (erroRecalc) return { error: `Cartão salvo, mas os vencimentos não foram recalculados: ${erroRecalc}` };
  }

  revalidatePath("/config");
  revalidatePath("/cartoes");
  revalidatePath("/lancar");
  revalidatePath("/contas");
  revalidatePath("/");
  revalidatePath("/lancamentos");
  return { error: null };
}

/** Recalcula o vencimento das compras não pagas de um cartão pelo ciclo novo. */
async function recalcularVencimentosDoCartao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cartaoId: string,
  ciclo: CicloCartao
): Promise<string | null> {
  const { data: saidas, error } = await supabase
    .from("saida")
    .select("id, data, created_at")
    .eq("cartao_id", cartaoId)
    .neq("status", "Pago");
  if (error) return error.message;
  const porVencimento = new Map<string, string[]>();
  for (const s of (saidas ?? []) as { id: string; data: string | null; created_at: string }[]) {
    const venc = formatCalendarDateISO(calcularVencimento(dataParaCalculo(s), "Crédito", ciclo));
    porVencimento.set(venc, [...(porVencimento.get(venc) ?? []), s.id]);
  }
  for (const [vencimento, ids] of porVencimento) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error: upErr } = await supabase.from("saida").update({ vencimento }).in("id", ids.slice(i, i + 200));
      if (upErr) return upErr.message;
    }
  }
  return null;
}

export async function excluirCartao(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("cartao").delete().eq("id", id);
  if (error) return { error: mensagemErro(error) };

  revalidatePath("/config");
  revalidatePath("/cartoes");
  revalidatePath("/contas");
  return { error: null };
}

// --- categoria ------------------------------------------------------------

export async function criarCategoria(formData: FormData): Promise<ActionResult> {
  const nome = String(formData.get("nome") ?? "").trim();
  const dono = String(formData.get("dono") ?? "") as CategoriaDono;
  const metaInput = String(formData.get("metaMensal") ?? "");

  if (!nome) return { error: "Informe o nome da categoria." };

  let metaMensalCents: number | null;
  try {
    metaMensalCents = parseLimite(metaInput);
  } catch {
    return { error: "Meta mensal inválida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("categoria").insert({ nome, dono, meta_mensal_cents: metaMensalCents });
  if (error) return { error: mensagemErro(error) };

  revalidatePath("/config");
  revalidatePath("/lancar");
  revalidatePath("/mes");
  revalidatePath("/categorias");
  return { error: null };
}

export async function atualizarCategoria(id: string, formData: FormData): Promise<ActionResult> {
  const nome = String(formData.get("nome") ?? "").trim();
  const dono = String(formData.get("dono") ?? "") as CategoriaDono;
  const metaInput = String(formData.get("metaMensal") ?? "");

  if (!nome) return { error: "Informe o nome da categoria." };

  let metaMensalCents: number | null;
  try {
    metaMensalCents = parseLimite(metaInput);
  } catch {
    return { error: "Meta mensal inválida." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("categoria")
    .update({ nome, dono, meta_mensal_cents: metaMensalCents })
    .eq("id", id);
  if (error) return { error: mensagemErro(error) };

  revalidatePath("/config");
  revalidatePath("/lancar");
  revalidatePath("/mes");
  revalidatePath("/categorias");
  return { error: null };
}

export async function excluirCategoria(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("categoria").delete().eq("id", id);
  if (error) return { error: mensagemErro(error) };

  revalidatePath("/config");
  revalidatePath("/lancar");
  revalidatePath("/mes");
  revalidatePath("/categorias");
  return { error: null };
}
