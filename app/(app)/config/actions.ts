"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  if (!nome) return { error: "Informe o nome da conta." };

  let saldoCents: number;
  try {
    saldoCents = parseCentsFromBRL(saldoInput || "0");
  } catch {
    return { error: "Saldo inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("conta").insert({ nome, dono, saldo_atual_cents: saldoCents });
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

  if (!nome) return { error: "Informe o nome da conta." };

  let saldoCents: number;
  try {
    saldoCents = parseCentsFromBRL(saldoInput || "0");
  } catch {
    return { error: "Saldo inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("conta")
    .update({ nome, dono, saldo_atual_cents: saldoCents })
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

  revalidatePath("/config");
  revalidatePath("/cartoes");
  revalidatePath("/lancar");
  revalidatePath("/contas");
  return { error: null };
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
