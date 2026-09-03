import type { SupabaseClient } from "@supabase/supabase-js";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { nomeSemParcela } from "@/lib/domain/parcelamento";
import type { Categoria, Pessoa } from "@/lib/domain/types";
import type { CatalogoIA } from "./interpretar-lancamento";

/**
 * Monta o catálogo que a IA pode usar para uma pessoa: contas e cartões dela,
 * categorias dela ou de ambos, e o histórico de nomes (1 por nome, o mais
 * recente) com categoria/método/destino. Funciona com o cliente de sessão
 * (app) ou o administrativo (API dos Atalhos).
 */
const CACHE_MS = 2 * 60 * 1000;
const cache = new Map<Pessoa, { em: number; catalogo: CatalogoIA }>();

export async function montarCatalogoIA(supabase: SupabaseClient, pessoa: Pessoa): Promise<CatalogoIA> {
  const quente = cache.get(pessoa);
  if (quente && Date.now() - quente.em < CACHE_MS) return quente.catalogo;
  const catalogo = await montarCatalogoDoBanco(supabase, pessoa);
  cache.set(pessoa, { em: Date.now(), catalogo });
  return catalogo;
}

async function montarCatalogoDoBanco(supabase: SupabaseClient, pessoa: Pessoa): Promise<CatalogoIA> {
  const [{ data: contas }, { data: cartoes }, { data: categorias }, { data: saidas }, { data: fixas }] = await Promise.all([
    supabase.from("conta").select("id, nome, dono").eq("dono", pessoa).order("nome"),
    supabase.from("cartao").select("id, nome, dono").eq("dono", pessoa).order("nome"),
    supabase.from("categoria").select("id, nome, dono").order("nome"),
    supabase
      .from("saida")
      .select("nome, metodo, categoria_id, conta_id, cartao_id, parcela, recorrente_id")
      .eq("pessoa", pessoa)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("recorrente").select("nome, ativo, fim").eq("pessoa", pessoa).order("nome"),
  ]);
  const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const contasFixas = ((fixas ?? []) as { nome: string; ativo: boolean; fim: string | null }[])
    .filter((f) => f.ativo && (!f.fim || f.fim >= hojeISO))
    .map((f) => f.nome);

  const listaContas = (contas ?? []) as { id: string; nome: string }[];
  const listaCartoes = (cartoes ?? []) as { id: string; nome: string }[];
  const listaCategorias = categoriasParaPessoa((categorias ?? []) as Categoria[], pessoa);
  const nomeConta = new Map(listaContas.map((c) => [c.id, c.nome]));
  const nomeCartao = new Map(listaCartoes.map((c) => [c.id, c.nome]));
  const nomeCategoria = new Map(listaCategorias.map((c) => [c.id, c.nome]));

  const vistos = new Map<string, { nome: string; categoria: string | null; metodo: string; destino: string | null; vezes: number }>();
  for (const s of (saidas ?? []) as {
    nome: string;
    metodo: string;
    categoria_id: string | null;
    conta_id: string | null;
    cartao_id: string | null;
    parcela: string | null;
    recorrente_id: string | null;
  }[]) {
    if (s.recorrente_id) continue;
    const nome = nomeSemParcela(s.nome, s.parcela).trim();
    if (!nome) continue;
    const k = nome.toLowerCase();
    const atual = vistos.get(k);
    if (atual) {
      atual.vezes += 1;
      continue;
    }
    vistos.set(k, {
      nome,
      categoria: s.categoria_id ? nomeCategoria.get(s.categoria_id) ?? null : null,
      metodo: s.metodo,
      destino: s.metodo === "Crédito" ? nomeCartao.get(s.cartao_id ?? "") ?? null : nomeConta.get(s.conta_id ?? "") ?? null,
      vezes: 1,
    });
  }
  const historico = [...vistos.values()].sort((a, b) => b.vezes - a.vezes).slice(0, 120);

  return {
    pessoa,
    contas: listaContas,
    cartoes: listaCartoes,
    categorias: listaCategorias.map((c) => ({ id: c.id, nome: c.nome })),
    historico,
    contasFixas,
  };
}
