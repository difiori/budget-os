"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentsFromBRL } from "@/lib/domain/money";
import type { CategoriaDono } from "@/lib/domain/types";

type ActionResult = { error: string | null };

function mensagemErro(error: { code?: string; message: string }): string {
  if (error.code === "23503") {
    return "Não é possível excluir: existem referências vinculadas a este item.";
  }
  return error.message;
}

function revalidarContas() {
  revalidatePath("/contas");
}

export async function criarMeta(formData: FormData): Promise<ActionResult> {
  const nome = String(formData.get("nome") ?? "").trim();
  const dono = String(formData.get("dono") ?? "") as CategoriaDono;
  const valorAlvoInput = String(formData.get("valorAlvo") ?? "");
  const valorAtualInput = String(formData.get("valorAtual") ?? "0");
  const contaId = String(formData.get("contaId") ?? "") || null;
  const dataAlvo = String(formData.get("dataAlvo") ?? "") || null;

  if (!nome) return { error: "Informe o nome da meta." };

  let valorAlvoCents: number;
  let valorAtualCents: number;
  try {
    valorAlvoCents = parseCentsFromBRL(valorAlvoInput || "0");
    valorAtualCents = parseCentsFromBRL(valorAtualInput || "0");
  } catch {
    return { error: "Valor inválido." };
  }
  if (valorAlvoCents <= 0) return { error: "O valor-alvo precisa ser maior que zero." };

  const supabase = await createClient();
  const { error } = await supabase.from("meta_poupanca").insert({
    nome,
    dono,
    valor_alvo_cents: valorAlvoCents,
    valor_atual_cents: valorAtualCents,
    conta_id: contaId,
    data_alvo: dataAlvo,
  });
  if (error) return { error: mensagemErro(error) };

  revalidarContas();
  return { error: null };
}

export async function atualizarMeta(id: string, formData: FormData): Promise<ActionResult> {
  const nome = String(formData.get("nome") ?? "").trim();
  const dono = String(formData.get("dono") ?? "") as CategoriaDono;
  const valorAlvoInput = String(formData.get("valorAlvo") ?? "");
  const valorAtualInput = String(formData.get("valorAtual") ?? "0");
  const contaId = String(formData.get("contaId") ?? "") || null;
  const dataAlvo = String(formData.get("dataAlvo") ?? "") || null;

  if (!nome) return { error: "Informe o nome da meta." };

  let valorAlvoCents: number;
  let valorAtualCents: number;
  try {
    valorAlvoCents = parseCentsFromBRL(valorAlvoInput || "0");
    valorAtualCents = parseCentsFromBRL(valorAtualInput || "0");
  } catch {
    return { error: "Valor inválido." };
  }
  if (valorAlvoCents <= 0) return { error: "O valor-alvo precisa ser maior que zero." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("meta_poupanca")
    .update({
      nome,
      dono,
      valor_alvo_cents: valorAlvoCents,
      valor_atual_cents: valorAtualCents,
      conta_id: contaId,
      data_alvo: dataAlvo,
    })
    .eq("id", id);
  if (error) return { error: mensagemErro(error) };

  revalidarContas();
  return { error: null };
}

export async function excluirMeta(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("meta_poupanca").delete().eq("id", id);
  if (error) return { error: mensagemErro(error) };

  revalidarContas();
  return { error: null };
}
