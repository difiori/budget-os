"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCentsFromBRL } from "@/lib/domain/money";

/** Define (ou remove, com valor vazio) a meta mensal de uma categoria. */
export async function definirMetaCategoria(id: string, metaInput: string): Promise<{ error: string | null }> {
  let metaMensalCents: number | null = null;
  const limpo = metaInput.trim();
  if (limpo) {
    try {
      metaMensalCents = parseCentsFromBRL(limpo);
    } catch {
      return { error: "Meta inválida." };
    }
    if (metaMensalCents <= 0) return { error: "A meta precisa ser maior que zero (ou vazia para remover)." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("categoria").update({ meta_mensal_cents: metaMensalCents }).eq("id", id);
  if (error) return { error: error.message };
  for (const p of ["/categorias", "/", "/config", "/mes"]) revalidatePath(p);
  return { error: null };
}
