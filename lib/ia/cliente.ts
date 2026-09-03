import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pessoa } from "@/lib/domain/types";

/**
 * Cliente da API da Anthropic — só no servidor. A chave vem de
 * ANTHROPIC_API_KEY (Vercel e .env.local). Sem chave, os recursos de IA se
 * escondem na interface e as ações devolvem erro amigável.
 */
/** Leitura de fatura e leitura do mês: qualidade acima de velocidade. */
export const MODELO_IA = "claude-opus-5";
/** Interpretar frases do Lançar rápido: extração estruturada, precisa ser rápida. */
export const MODELO_IA_RAPIDO = "claude-sonnet-5";
export type ModeloIA = typeof MODELO_IA | typeof MODELO_IA_RAPIDO;

export function iaConfigurada(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let cliente: Anthropic | null = null;
export function clienteIA(): Anthropic {
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

/** Preços de lista por modelo, em USD por milhão de tokens (estimativa de custo). */
const PRECO_USD_POR_MTOK: Record<ModeloIA, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};

export interface UsoIA {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Custo estimado em micro-dólares (1e-6 USD), inteiro. */
export function custoMicroUsd(uso: UsoIA, modelo: ModeloIA = MODELO_IA): number {
  const preco = PRECO_USD_POR_MTOK[modelo];
  const cacheRead = uso.cache_read_input_tokens ?? 0;
  const cacheWrite = uso.cache_creation_input_tokens ?? 0;
  const naoCache = Math.max(0, uso.input_tokens - cacheRead - cacheWrite);
  const usd =
    (naoCache * preco.input + cacheRead * preco.cacheRead + cacheWrite * preco.cacheWrite + uso.output_tokens * preco.output) /
    1_000_000;
  return Math.round(usd * 1_000_000);
}

/** Grava uma linha em `ia_uso` para o custo aparecer no app. Nunca derruba a ação. */
export async function registrarUsoIA(
  supabase: SupabaseClient,
  registro: { recurso: string; uso: UsoIA; pessoa: Pessoa | null; sucesso: boolean; detalhe?: string | null; modelo?: ModeloIA }
): Promise<void> {
  const modelo = registro.modelo ?? MODELO_IA;
  try {
    await supabase.from("ia_uso").insert({
      recurso: registro.recurso,
      modelo,
      input_tokens: registro.uso.input_tokens,
      output_tokens: registro.uso.output_tokens,
      cache_read_tokens: registro.uso.cache_read_input_tokens ?? 0,
      cache_write_tokens: registro.uso.cache_creation_input_tokens ?? 0,
      custo_micro_usd: custoMicroUsd(registro.uso, modelo),
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
