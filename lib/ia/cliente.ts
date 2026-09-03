import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pessoa } from "@/lib/domain/types";

/**
 * Cliente da API da Anthropic — só no servidor. A chave vem de
 * ANTHROPIC_API_KEY (Vercel e .env.local). Sem chave, os recursos de IA se
 * escondem na interface e as ações devolvem erro amigável.
 */
export const MODELO_IA = "claude-opus-5";

export function iaConfigurada(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let cliente: Anthropic | null = null;
export function clienteIA(): Anthropic {
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

/** Preços de lista do modelo, em USD por milhão de tokens (estimativa de custo). */
const PRECO_USD_POR_MTOK = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };

export interface UsoIA {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Custo estimado em micro-dólares (1e-6 USD), inteiro. */
export function custoMicroUsd(uso: UsoIA): number {
  const cacheRead = uso.cache_read_input_tokens ?? 0;
  const cacheWrite = uso.cache_creation_input_tokens ?? 0;
  const naoCache = Math.max(0, uso.input_tokens - cacheRead - cacheWrite);
  const usd =
    (naoCache * PRECO_USD_POR_MTOK.input +
      cacheRead * PRECO_USD_POR_MTOK.cacheRead +
      cacheWrite * PRECO_USD_POR_MTOK.cacheWrite +
      uso.output_tokens * PRECO_USD_POR_MTOK.output) /
    1_000_000;
  return Math.round(usd * 1_000_000);
}

/** Grava uma linha em `ia_uso` para o custo aparecer no app. Nunca derruba a ação. */
export async function registrarUsoIA(
  supabase: SupabaseClient,
  registro: { recurso: string; uso: UsoIA; pessoa: Pessoa | null; sucesso: boolean; detalhe?: string | null }
): Promise<void> {
  try {
    await supabase.from("ia_uso").insert({
      recurso: registro.recurso,
      modelo: MODELO_IA,
      input_tokens: registro.uso.input_tokens,
      output_tokens: registro.uso.output_tokens,
      cache_read_tokens: registro.uso.cache_read_input_tokens ?? 0,
      cache_write_tokens: registro.uso.cache_creation_input_tokens ?? 0,
      custo_micro_usd: custoMicroUsd(registro.uso),
      pessoa: registro.pessoa,
      sucesso: registro.sucesso,
      detalhe: registro.detalhe ?? null,
    });
  } catch (e) {
    console.warn("[ia] não foi possível registrar uso:", e);
  }
}

/** Erro da API em uma frase para a interface. */
export function mensagemErroIA(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Chave da API da Anthropic inválida ou ausente.";
  if (e instanceof Anthropic.RateLimitError) return "A API está limitando as chamadas agora. Tente de novo em instantes.";
  if (e instanceof Anthropic.BadRequestError) return `Pedido rejeitado pela API: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return "Sem conexão com a API da Anthropic.";
  if (e instanceof Anthropic.APIError) return `Erro da API (${e.status ?? "?"}): ${e.message}`;
  if (e instanceof Error) return e.message;
  return "Erro inesperado ao falar com a IA.";
}
