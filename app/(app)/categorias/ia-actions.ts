"use server";

import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { clienteIA, iaConfigurada, MODELO_IA_RAPIDO, mensagemErroIA, registrarUsoIA } from "@/lib/ia/cliente";
import {
  ClassificacaoSchema,
  mensagemClassificar,
  montarHistoricoCategorias,
  proporPeloHistorico,
  propostasDaIA,
  systemPromptClassificar,
  LOTE_IA,
  type ItemParaClassificar,
  type Proposta,
} from "@/lib/ia/classificar-categorias";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import type { Escopo } from "@/lib/domain/escopo";
import type { Categoria, Pessoa } from "@/lib/domain/types";

export interface PendenteClassificacao extends ItemParaClassificar {
  categoriaAtualId: string | null;
}

export type ResultadoPendentes =
  | { ok: true; itens: PendenteClassificacao[]; propostasHistorico: Proposta[]; gastosDiversosId: string | null }
  | { ok: false; error: string };

const LIMITE_ITENS = 400;

/**
 * Saídas em "Gastos Diversos" ou sem categoria, no escopo pedido: do mês
 * (por vencimento, como a tela) ou todas. Já devolve as propostas que o
 * histórico resolve sozinho; o resto o cliente manda para a IA em lotes.
 */
export async function listarPendentesClassificacao(input: { escopo: Escopo; inicioMes?: string; fimMes?: string }): Promise<ResultadoPendentes> {
  const supabase = await createClient();
  const [{ data: categorias }, { data: contas }, { data: cartoes }] = await Promise.all([
    supabase.from("categoria").select("id, nome, dono"),
    supabase.from("conta").select("id, nome"),
    supabase.from("cartao").select("id, nome"),
  ]);
  const gd = ((categorias ?? []) as Categoria[]).find((c) => c.nome === "Gastos Diversos")?.id ?? null;

  let q = supabase
    .from("saida")
    .select("id, nome, pessoa, total_cents, metodo, conta_id, cartao_id, data, created_at, vencimento, categoria_id")
    .order("data", { ascending: false })
    .limit(LIMITE_ITENS);
  q = gd ? q.or(`categoria_id.eq.${gd},categoria_id.is.null`) : q.is("categoria_id", null);
  if (input.escopo !== "Casal") q = q.eq("pessoa", input.escopo);
  if (input.inicioMes && input.fimMes) q = q.gte("vencimento", input.inicioMes).lt("vencimento", input.fimMes);
  const { data: rows, error } = await q;
  if (error) return { ok: false, error: error.message };

  const contaNome = new Map(((contas ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));
  const cartaoNome = new Map(((cartoes ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));
  const itens: PendenteClassificacao[] = ((rows ?? []) as {
    id: string; nome: string; pessoa: Pessoa; total_cents: number; metodo: string; conta_id: string | null; cartao_id: string | null; data: string | null; created_at: string; categoria_id: string | null;
  }[]).map((r) => ({
    id: r.id,
    nome: r.nome,
    pessoa: r.pessoa,
    valor_cents: r.total_cents,
    metodo: r.metodo,
    destino: r.metodo === "Crédito" ? cartaoNome.get(r.cartao_id ?? "") ?? null : contaNome.get(r.conta_id ?? "") ?? null,
    data: (r.data ?? r.created_at).slice(0, 10),
    categoriaAtualId: r.categoria_id,
  }));

  // Histórico das pessoas envolvidas (o que já tem categoria de verdade).
  const pessoas = [...new Set(itens.map((i) => i.pessoa))];
  let hq = supabase.from("saida").select("nome, pessoa, categoria_id").not("categoria_id", "is", null).order("created_at", { ascending: false }).limit(3000);
  if (pessoas.length === 1) hq = hq.eq("pessoa", pessoas[0]);
  const { data: historicoRows } = await hq;
  const hist = montarHistoricoCategorias((historicoRows ?? []) as { nome: string; pessoa: Pessoa; categoria_id: string | null }[], gd);
  const propostasHistorico = itens.map((it) => proporPeloHistorico(it, hist)).filter((p): p is Proposta => p !== null);

  return { ok: true, itens, propostasHistorico, gastosDiversosId: gd };
}

export type ResultadoPropostasIA = { ok: true; propostas: Proposta[] } | { ok: false; error: string };

/** Um lote (até LOTE_IA itens) de uma pessoa → propostas da IA. */
export async function proporCategoriasIA(itens: ItemParaClassificar[]): Promise<ResultadoPropostasIA> {
  if (!iaConfigurada()) return { ok: false, error: "IA não configurada: defina ANTHROPIC_API_KEY no servidor." };
  if (itens.length === 0) return { ok: true, propostas: [] };
  if (itens.length > LOTE_IA) return { ok: false, error: `Mande até ${LOTE_IA} itens por vez.` };
  const pessoa = itens[0].pessoa;
  if (itens.some((i) => i.pessoa !== pessoa)) return { ok: false, error: "Um lote por pessoa." };

  const supabase = await createClient();
  const [{ data: categoriasRaw }, { data: historicoRows }] = await Promise.all([
    supabase.from("categoria").select("id, nome, dono").order("nome"),
    supabase.from("saida").select("nome, pessoa, categoria_id").eq("pessoa", pessoa).not("categoria_id", "is", null).order("created_at", { ascending: false }).limit(1500),
  ]);
  const todas = (categoriasRaw ?? []) as Categoria[];
  const gd = todas.find((c) => c.nome === "Gastos Diversos")?.id ?? null;
  // O destino nunca é "Gastos Diversos": a proposta existe para tirar dali.
  const categorias = categoriasParaPessoa(todas, pessoa).filter((c) => c.id !== gd).map((c) => ({ id: c.id, nome: c.nome }));
  const nomeCat = new Map(categorias.map((c) => [c.id, c.nome]));
  const hist = montarHistoricoCategorias((historicoRows ?? []) as { nome: string; pessoa: Pessoa; categoria_id: string | null }[], gd);
  const exemplos = [...hist.entries()]
    .filter(([k]) => k.startsWith(`${pessoa}|`))
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => ({ nome: k.split("|")[1], categoria: nomeCat.get(v.categoriaId) ?? "" }))
    .filter((e) => e.categoria);

  try {
    const resposta = await clienteIA().messages.parse({
      model: MODELO_IA_RAPIDO,
      max_tokens: 4000,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: systemPromptClassificar({ pessoa, categorias, exemplos }), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: mensagemClassificar(itens) }],
      output_config: { format: zodOutputFormat(ClassificacaoSchema) },
    });
    const parsed = resposta.parsed_output;
    await registrarUsoIA(supabase, {
      recurso: "classificar_categorias",
      modelo: MODELO_IA_RAPIDO,
      uso: resposta.usage,
      pessoa,
      sucesso: !!parsed,
      detalhe: parsed ? `${itens.length} itens` : `stop_reason=${resposta.stop_reason}`,
    });
    if (!parsed) return { ok: false, error: "A IA não devolveu uma classificação válida." };
    return { ok: true, propostas: propostasDaIA(parsed, itens, categorias) };
  } catch (e) {
    return { ok: false, error: mensagemErroIA(e) };
  }
}
