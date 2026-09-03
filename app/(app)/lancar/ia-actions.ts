"use server";

import { createClient } from "@/lib/supabase/server";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { interpretarTexto, type ResultadoInterpretacao } from "@/lib/ia/interpretar-servidor";

/** Lançar rápido: frase livre → lançamento pré-preenchido para a pessoa revisar. */
export async function interpretarLancamentoIA(texto: string): Promise<ResultadoInterpretacao> {
  const supabase = await createClient();
  const pessoa = await pessoaAtiva();
  return interpretarTexto(supabase, pessoa, texto);
}
