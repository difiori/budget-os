import type { SupabaseClient } from "@supabase/supabase-js";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { hoje } from "@/lib/domain/calendar-date";
import type { Pessoa } from "@/lib/domain/types";
import { clienteIA, iaConfigurada, MODELO_IA_RAPIDO, mensagemErroIA, registrarUsoIA } from "./cliente";
import { montarCatalogoIA } from "./catalogo";
import {
  LoteInterpretadoSchema,
  mensagemUsuarioInterpretar,
  saneiaInterpretacao,
  systemPromptInterpretar,
  type LancamentoInterpretado,
} from "./interpretar-lancamento";

export type ResultadoInterpretacao = { ok: true; lancamentos: LancamentoInterpretado[] } | { ok: false; error: string };

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
  if (t.length > 2000) return { ok: false, error: "Texto longo demais — até uns 20 lançamentos por vez." };

  const catalogo = await montarCatalogoIA(supabase, pessoa);
  try {
    const resposta = await clienteIA().messages.parse({
      model: MODELO_IA_RAPIDO,
      max_tokens: 6000,
      system: [{ type: "text", text: systemPromptInterpretar(catalogo), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: mensagemUsuarioInterpretar(t, hoje()) }],
      // Extração estruturada: sem raciocínio estendido a resposta sai em ~3 s
      // (medido) com a mesma precisão; com ele, 5 a 8 s.
      thinking: { type: "disabled" },
      output_config: { format: zodOutputFormat(LoteInterpretadoSchema) },
    });
    const parsed = resposta.parsed_output;
    await registrarUsoIA(supabase, {
      recurso: "interpretar_lancamento",
      modelo: MODELO_IA_RAPIDO,
      uso: resposta.usage,
      pessoa,
      sucesso: !!parsed,
      detalhe: parsed ? `${parsed.lancamentos.length} itens` : `stop_reason=${resposta.stop_reason}`,
    });
    if (!parsed) return { ok: false, error: "A IA não devolveu um lançamento válido. Tente reformular a frase." };
    if (parsed.lancamentos.length === 0) return { ok: false, error: "Não encontrei nenhum lançamento na frase." };
    return { ok: true, lancamentos: parsed.lancamentos.map((l) => saneiaInterpretacao(l, catalogo)) };
  } catch (e) {
    return { ok: false, error: mensagemErroIA(e) };
  }
}
