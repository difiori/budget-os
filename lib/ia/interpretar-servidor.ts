import type { SupabaseClient } from "@supabase/supabase-js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { hoje } from "@/lib/domain/calendar-date";
import type { Pessoa } from "@/lib/domain/types";
import { clienteIA, iaConfigurada, MODELO_IA, mensagemErroIA, registrarUsoIA } from "./cliente";
import { montarCatalogoIA } from "./catalogo";
import {
  LancamentoInterpretadoSchema,
  mensagemUsuarioInterpretar,
  saneiaInterpretacao,
  systemPromptInterpretar,
  type LancamentoInterpretado,
} from "./interpretar-lancamento";

export type ResultadoInterpretacao = { ok: true; lancamento: LancamentoInterpretado } | { ok: false; error: string };

/**
 * Frase → lançamento estruturado, restrito ao catálogo da pessoa. Saída
 * estruturada (schema) garante a forma; `saneiaInterpretacao` garante que os
 * ids existem. Usado pela ação do app (cliente de sessão) e pela API dos
 * Atalhos (cliente administrativo).
 */
export async function interpretarTexto(supabase: SupabaseClient, pessoa: Pessoa, texto: string): Promise<ResultadoInterpretacao> {
  if (!iaConfigurada()) return { ok: false, error: "IA não configurada: defina ANTHROPIC_API_KEY no servidor." };
  const t = texto.trim();
  if (t.length < 3) return { ok: false, error: "Descreva o lançamento com um pouco mais de detalhe." };
  if (t.length > 600) return { ok: false, error: "Frase longa demais — descreva um lançamento por vez." };

  const catalogo = await montarCatalogoIA(supabase, pessoa);
  try {
    const resposta = await clienteIA().messages.parse({
      model: MODELO_IA,
      max_tokens: 2000,
      system: [{ type: "text", text: systemPromptInterpretar(catalogo), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: mensagemUsuarioInterpretar(t, hoje()) }],
      output_config: { effort: "medium", format: zodOutputFormat(LancamentoInterpretadoSchema) },
    });
    const parsed = resposta.parsed_output;
    await registrarUsoIA(supabase, {
      recurso: "interpretar_lancamento",
      uso: resposta.usage,
      pessoa,
      sucesso: !!parsed,
      detalhe: parsed ? null : `stop_reason=${resposta.stop_reason}`,
    });
    if (!parsed) return { ok: false, error: "A IA não devolveu um lançamento válido. Tente reformular a frase." };
    return { ok: true, lancamento: saneiaInterpretacao(parsed, catalogo) };
  } catch (e) {
    return { ok: false, error: mensagemErroIA(e) };
  }
}
