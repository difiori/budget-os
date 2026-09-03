/**
 * Leitura do mês: a IA escreve, em português, o que os números do Resumo
 * Mensal dizem. Ela recebe SÓ números já calculados pelo domínio — nunca
 * calcula nada — e o texto fica guardado por (mês, escopo) com o hash dos
 * dados, para não gerar de novo enquanto nada mudou.
 */

export interface DadosFechamento {
  mesLabel: string;
  mesAnteriorLabel: string;
  escopo: string;
  entradas: number;
  saidas: number;
  resultado: number;
  entradasAnterior: number;
  saidasAnterior: number;
  resultadoAnterior: number;
  taxaPoupancaPct: number | null;
  taxaPoupancaAnteriorPct: number | null;
  fixas: { total: number; quantidade: number; pctDasSaidas: number; pctDasEntradas: number | null };
  variaveis: { total: number; quantidade: number };
  /** Categorias com movimento, maior atual primeiro (até 12). */
  categorias: { nome: string; atual: number; anterior: number }[];
  /** Maiores saídas do mês (até 8). */
  maioresSaidas: { nome: string; valor: number; categoria: string; dia: string }[];
  /** Contas fixas cujo valor do mês fugiu do previsto. */
  fixasDivergentes: { nome: string; previsto: number; real: number }[];
}

/** Hash curto e estável (FNV-1a) do JSON dos dados. */
export function hashDados(d: DadosFechamento): string {
  const s = JSON.stringify(d);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const SYSTEM_PROMPT_NARRATIVA = `Você é o gestor financeiro pessoal de um casal (Diego e Vitor) e escreve a leitura do mês para o app Budget OS, em português do Brasil.

Você recebe um JSON com números JÁ CALCULADOS (valores em centavos). Regras:
- Use somente os números fornecidos. Não calcule nada novo além de diferenças simples entre números dados; nunca estime, nunca invente causas. Quando não souber o motivo de uma variação, diga o que vale checar em vez de supor.
- Formate valores como R$ 1.234 (arredonde para o real inteiro quando acima de R$ 100; centavos só abaixo disso). Percentuais inteiros.
- Estrutura: 3 parágrafos curtos, sem títulos, sem listas, sem markdown. Total entre 6 e 9 linhas.
  1) O essencial: resultado do mês, taxa de poupança e como se compara ao mês anterior.
  2) O que explica: as 2 ou 3 categorias que mais mudaram, o peso das contas fixas, e contas fixas que fugiram do previsto (se houver).
  3) O que fazer: 2 ou 3 recomendações concretas, pequenas e realistas para o mês seguinte, ligadas aos números.
- Tom direto e humano, como um bom consultor que conhece a casa. Sem moralizar, sem exclamação, sem emojis. Se o resultado for negativo, diga com clareza e sem drama.
- Se o escopo for uma pessoa, fale dela ("você"); se for "Casal", fale de vocês.`;

export function mensagemNarrativa(d: DadosFechamento): string {
  return `Dados do fechamento (centavos):\n${JSON.stringify(d, null, 2)}`;
}
