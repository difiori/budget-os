import { createClient } from "@/lib/supabase/server";
import { getContaAtiva } from "./conta-ativa";
import { pessoaPorEmail } from "./pessoa";
import type { Pessoa } from "@/lib/domain/types";

/** Pessoa ativa do menu lateral (cookie), com fallback pelo email autenticado.
 * É o escopo padrão de Mês, Cartões e Lançamentos. */
export async function pessoaAtiva(): Promise<Pessoa> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (await getContaAtiva()) ?? pessoaPorEmail(user?.email) ?? "Diego";
}
