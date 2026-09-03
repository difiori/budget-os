import { z } from "zod";
import { formatCentsToBRL } from "@/lib/domain/money";
import type { Pessoa } from "@/lib/domain/types";

/**
 * Categorização assistida em lote: o que caiu em "Gastos Diversos" (ou ficou
 * sem categoria) ganha uma proposta de categoria. Duas fontes, nesta ordem:
 * 1) histórico — o mesmo nome já tem uma categoria dominante fora de Gastos
 *    Diversos (determinístico, sem IA); 2) IA para o resto, com o catálogo de
 *    categorias em códigos curtos e exemplos do histórico. Nada é gravado
 *    sem a pessoa revisar.
 */

/** Itens por chamada à IA (uma pessoa por lote). */
export const LOTE_IA = 40;

export interface ItemParaClassificar {
  id: string;
  nome: string;
  pessoa: Pessoa;
  valor_cents: number;
  metodo: string;
  destino: string | null;
  data: string;
}

export interface CategoriaOpcao {
  id: string;
  nome: string;
}

/** nome normalizado → categoria dominante (fora de Gastos Diversos). */
export type HistoricoCategorias = Map<string, { categoriaId: string; vezes: number; total: number }>;

export interface Proposta {
  id: string;
  categoriaId: string | null;
  confianca: number;
  origem: "historico" | "ia" | "nenhuma";
}

export function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+\d{2}\/\d{2}$/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Monta o histórico: para cada (pessoa, nome), a categoria mais usada entre as
 * saídas que NÃO estão em Gastos Diversos nem sem categoria.
 */
export function montarHistoricoCategorias(
  saidas: { nome: string; pessoa: Pessoa; categoria_id: string | null }[],
  gastosDiversosId: string | null
): HistoricoCategorias {
  const contagem = new Map<string, Map<string, number>>();
  for (const s of saidas) {
    if (!s.categoria_id || s.categoria_id === gastosDiversosId) continue;
    const k = `${s.pessoa}|${normalizarNome(s.nome)}`;
    const m = contagem.get(k) ?? new Map<string, number>();
    m.set(s.categoria_id, (m.get(s.categoria_id) ?? 0) + 1);
    contagem.set(k, m);
  }
  const hist: HistoricoCategorias = new Map();
  for (const [k, m] of contagem) {
    const ordenado = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const total = ordenado.reduce((s, [, n]) => s + n, 0);
    hist.set(k, { categoriaId: ordenado[0][0], vezes: ordenado[0][1], total });
  }
  return hist;
}

/** Proposta pelo histórico quando a categoria dominante responde por ≥ 2/3 dos usos do nome. */
export function proporPeloHistorico(item: ItemParaClassificar, hist: HistoricoCategorias): Proposta | null {
  const h = hist.get(`${item.pessoa}|${normalizarNome(item.nome)}`);
  if (!h || h.vezes / h.total < 2 / 3) return null;
  return { id: item.id, categoriaId: h.categoriaId, confianca: h.total >= 3 ? 1 : 0.85, origem: "historico" };
}

/* ------------------------------------------------------------------------ */
/* IA                                                                        */
/* ------------------------------------------------------------------------ */

export const ClassificacaoSchema = z.object({
  itens: z.array(
    z.object({
      /** Índice do item na lista enviada (1-based). */
      i: z.number().int(),
      /** Código da categoria (G1, G2…) ou null quando nenhuma serve. */
      categoria: z.string().nullable(),
      confianca: z.number(),
    })
  ),
});
export type Classificacao = z.infer<typeof ClassificacaoSchema>;

export function codigosDeCategorias(categorias: CategoriaOpcao[]): { codigoDe: Map<string, string>; idDe: Map<string, string> } {
  const codigoDe = new Map<string, string>();
  const idDe = new Map<string, string>();
  categorias.forEach((c, i) => {
    codigoDe.set(c.id, `G${i + 1}`);
    idDe.set(`G${i + 1}`, c.id);
  });
  return { codigoDe, idDe };
}

export function systemPromptClassificar(input: {
  pessoa: Pessoa;
  categorias: CategoriaOpcao[];
  exemplos: { nome: string; categoria: string }[];
}): string {
  const { codigoDe } = codigosDeCategorias(input.categorias);
  const lista = input.categorias.map((c) => `- ${codigoDe.get(c.id)} = ${c.nome}`).join("\n");
  const exemplos = input.exemplos
    .slice(0, 150)
    .map((e) => `- "${e.nome}" → ${e.categoria}`)
    .join("\n");
  return `Você classifica gastos pessoais de ${input.pessoa} (um casal brasileiro, app Budget OS) em categorias. Recebe uma lista numerada de saídas que hoje estão em "Gastos Diversos" ou sem categoria, e devolve, para cada índice, o código da categoria mais adequada.

REGRAS
- Use somente os códigos do catálogo. Nunca invente.
- Quando nenhuma categoria servir de verdade, devolva categoria null — é melhor deixar em Gastos Diversos do que forçar.
- Siga os exemplos do histórico quando o nome for igual ou claramente o mesmo estabelecimento.
- Pistas: nome do estabelecimento, valor, método e cartão/conta. Restaurante, lanche e delivery → a categoria de delivery/restaurantes se existir; supermercado, padaria e conveniência → Alimentação; farmácia → Farmácia; ônibus, Uber, 99 → Transporte; jogos e assinaturas de jogos → Gaming; streaming e software → Assinaturas; compras de produtos online → Shopping; tinta, ferramenta, material de obra → Reforma; itens de gato/cachorro → Pets; cigarro, pod, tabacaria → Tabacaria; "gan gan"/"weed" → Weed; conta da mãe → Contas mãe; luz, água, condomínio, internet da casa → Apartamento.
- confianca: 0 a 1; abaixo de 0,7 significa que a pessoa deve olhar antes de aplicar.
- Devolva exatamente um item por índice recebido, na mesma ordem.

CATÁLOGO
${lista}

HISTÓRICO (nome → categoria já usada)
${exemplos || "- (sem histórico)"}`;
}

export function mensagemClassificar(itens: ItemParaClassificar[]): string {
  const linhas = itens.map((it, i) => {
    const valor = formatCentsToBRL(it.valor_cents);
    return `${i + 1}) ${it.nome} · ${valor} · ${it.metodo}${it.destino ? ` · ${it.destino}` : ""} · ${it.data}`;
  });
  return `Classifique estas ${itens.length} saídas:\n${linhas.join("\n")}`;
}

/** Traduz a resposta da IA para propostas por id, validando códigos e índices. */
export function propostasDaIA(resposta: Classificacao, itens: ItemParaClassificar[], categorias: CategoriaOpcao[]): Proposta[] {
  const { idDe } = codigosDeCategorias(categorias);
  const porIndice = new Map(resposta.itens.map((r) => [r.i, r]));
  return itens.map((it, i) => {
    const r = porIndice.get(i + 1);
    const categoriaId = r?.categoria ? idDe.get(r.categoria) ?? null : null;
    if (!r || !categoriaId) return { id: it.id, categoriaId: null, confianca: 0, origem: "nenhuma" as const };
    return { id: it.id, categoriaId, confianca: Math.max(0, Math.min(1, r.confianca)), origem: "ia" as const };
  });
}
