"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { clienteIA, iaConfigurada, MODELO_IA, mensagemErroIA, registrarUsoIA } from "@/lib/ia/cliente";
import { hashDados, mensagemNarrativa, SYSTEM_PROMPT_NARRATIVA, type DadosFechamento } from "@/lib/ia/narrativa-fechamento";

export interface LeituraDoMes {
  texto: string;
  hash: string;
  geradoEm: string;
}

export type ResultadoLeitura = { ok: true; leitura: LeituraDoMes; reaproveitada: boolean } | { ok: false; error: string };

/**
 * Gera (ou reaproveita) a leitura do mês. Se já existe uma leitura para o
 * mesmo mês/escopo com o mesmo hash de dados, devolve a guardada sem chamar
 * a API. `forcar` regenera mesmo assim.
 */
export async function gerarLeituraDoMes(input: {
  mesISO: string;
  escopo: string;
  dados: DadosFechamento;
  forcar?: boolean;
}): Promise<ResultadoLeitura> {
  if (!iaConfigurada()) return { ok: false, error: "IA não configurada: defina ANTHROPIC_API_KEY no servidor." };
  const supabase = await createClient();
  const pessoa = await pessoaAtiva();
  const hash = hashDados(input.dados);

  if (!input.forcar) {
    const { data: existente } = await supabase
      .from("fechamento_narrativa")
      .select("texto, hash, gerado_em")
      .eq("mes", input.mesISO)
      .eq("escopo", input.escopo)
      .maybeSingle();
    if (existente && existente.hash === hash) {
      return { ok: true, leitura: { texto: existente.texto, hash, geradoEm: existente.gerado_em }, reaproveitada: true };
    }
  }

  try {
    const resposta = await clienteIA().messages.create({
      model: MODELO_IA,
      max_tokens: 2000,
      system: [{ type: "text", text: SYSTEM_PROMPT_NARRATIVA, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: mensagemNarrativa(input.dados) }],
      output_config: { effort: "medium" },
    });
    const texto = resposta.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const ok = resposta.stop_reason !== "refusal" && texto.length > 0;
    await registrarUsoIA(supabase, {
      recurso: "leitura_do_mes",
      uso: resposta.usage,
      pessoa,
      sucesso: ok,
      detalhe: ok ? null : `stop_reason=${resposta.stop_reason}`,
    });
    if (!ok) return { ok: false, error: "A IA não devolveu uma leitura. Tente de novo." };

    const geradoEm = new Date().toISOString();
    const { error } = await supabase
      .from("fechamento_narrativa")
      .upsert(
        { mes: input.mesISO, escopo: input.escopo, hash, texto, modelo: MODELO_IA, gerado_em: geradoEm, gerado_por: pessoa },
        { onConflict: "mes,escopo" }
      );
    if (error) return { ok: false, error: `Leitura gerada, mas não foi guardada: ${error.message}` };

    revalidatePath("/mes");
    return { ok: true, leitura: { texto, hash, geradoEm }, reaproveitada: false };
  } catch (e) {
    return { ok: false, error: mensagemErroIA(e) };
  }
}
