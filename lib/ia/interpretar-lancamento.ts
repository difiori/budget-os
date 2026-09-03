import { z } from "zod";
import { formatCalendarDateISO, type CalendarDate } from "@/lib/domain/calendar-date";
import type { Cartao, Categoria, Conta, Pessoa } from "@/lib/domain/types";

/**
 * Captura em linguagem natural: "54 amazon no business", "paguei 320 de luz
 * da mãe hoje", "recebi 6500 do salário", "transferi 500 da CPF pra CNPJ".
 * A IA devolve um lançamento no schema abaixo, restrito ao catálogo (ids
 * reais de contas, cartões e categorias). O app valida e pré-preenche o
 * formulário — quem salva é a pessoa, nunca a IA.
 */

export const LancamentoInterpretadoSchema = z.object({
  tipo: z.enum(["Saida", "Entrada", "Transferencia"]),
  nome: z.string(),
  valor_cents: z.number().int(),
  metodo: z.enum(["Débito", "Crédito"]).nullable(),
  /** Conta (débito/entrada) ou cartão (crédito), pelo id do catálogo. */
  destino_id: z.string().nullable(),
  de_conta_id: z.string().nullable(),
  para_conta_id: z.string().nullable(),
  categoria_id: z.string().nullable(),
  data: z.string(),
  status: z.enum(["Pago", "A pagar", "Recebido", "Não recebido"]),
  parcelas: z.number().int(),
  conta_fixa: z.boolean(),
  /** A frase se refere a uma conta fixa que JÁ existe (o mês se paga em Contas fixas, não vira lançamento novo). */
  conta_fixa_existente: z.boolean(),
  confianca: z.number(),
  duvidas: z.array(z.string()),
});

export type LancamentoInterpretado = z.infer<typeof LancamentoInterpretadoSchema>;

export interface CatalogoIA {
  pessoa: Pessoa;
  contas: Pick<Conta, "id" | "nome">[];
  cartoes: Pick<Cartao, "id" | "nome">[];
  categorias: Pick<Categoria, "id" | "nome">[];
  /** Nomes já usados com a categoria/método/destino mais recentes — guia a IA. */
  historico: { nome: string; categoria: string | null; metodo: string; destino: string | null }[];
  /** Contas fixas ativas da pessoa — para a IA reconhecer "paguei a luz da mãe" como pagamento de algo que já existe. */
  contasFixas: string[];
}

/** Parte estável do prompt (vai para o cache): regras + catálogo. */
export function systemPromptInterpretar(catalogo: CatalogoIA): string {
  const lista = (xs: { id: string; nome: string }[]) => xs.map((x) => `- ${x.nome} (id ${x.id})`).join("\n") || "- (nenhum)";
  const hist = catalogo.historico
    .slice(0, 120)
    .map((h) => `- "${h.nome}" → ${h.categoria ?? "sem categoria"} · ${h.metodo}${h.destino ? ` · ${h.destino}` : ""}`)
    .join("\n");
  return `Você interpreta frases curtas em português sobre gastos e receitas de um casal e as transforma em um lançamento estruturado para o app Budget OS. A pessoa ativa é ${catalogo.pessoa}. Nunca invente ids: use somente os do catálogo. Quando algo não estiver claro, escolha o mais provável, reduza a confiança e explique em "duvidas".

REGRAS
- tipo: "Saida" para gasto/compra/pagamento; "Entrada" para receita/recebimento/salário/pix recebido; "Transferencia" quando move dinheiro entre duas contas da própria pessoa ("transferi", "mandei da X pra Y").
- metodo: "Crédito" quando citar cartão, crédito, parcelas ou o nome de um cartão do catálogo; "Débito" para pix, débito, boleto, dinheiro ou quando citar uma conta. Entrada e transferência têm metodo null.
- destino_id: id do CARTÃO quando metodo é Crédito; id da CONTA quando Débito ou Entrada. Se a frase não citar, use a conta/cartão mais provável pelo histórico do mesmo nome; se ainda assim não souber, escolha o primeiro do catálogo e registre a dúvida.
- de_conta_id / para_conta_id: só em transferência (ids de contas). Fora disso, null.
- categoria_id: a mais adequada do catálogo, preferindo a que o histórico usa para o mesmo nome. Entrada e transferência: null.
- valor_cents: inteiro em centavos. "54" = 5400; "1.234,56" = 123456; "R$ 12,9" = 1290.
- data: ISO (AAAA-MM-DD). "hoje" e frases sem data = a data de hoje informada na mensagem; "ontem" = um dia antes; "dia 15" = dia 15 do mês corrente (ou do anterior se ainda não chegou e a frase for no passado).
- status: saída "Pago" se a frase indica que já pagou ("paguei", "pago", "comprei" no débito), senão "A pagar"; entrada "Recebido" se "recebi/caiu/entrou", senão "Não recebido". Compra no crédito é sempre "A pagar" (a fatura é que se paga).
- parcelas: 1 à vista; "em 12x", "12 vezes", "parcelado em 10" → o número.
- conta_fixa_existente: true quando a frase se refere a uma das CONTAS FIXAS EXISTENTES abaixo (ex.: "paguei a luz da mãe" quando existe "Enel mãe"). Nesse caso use o nome dela, preencha o resto normalmente e deixe conta_fixa false — o pagamento do mês é feito na tela Contas fixas, não como lançamento novo.
- conta_fixa: true só para uma conta fixa NOVA, quando a frase indica recorrência mensal ("todo mês", "mensal", "assinatura", "aluguel", "condomínio") e não há conta fixa existente equivalente; senão false.
- nome: curto e capitalizado como no histórico quando existir ("Amazon", "Enel mãe"); sem valor e sem data no nome.
- confianca: 0 a 1. Abaixo de 0,6 significa que a pessoa precisa revisar antes de salvar.

CATÁLOGO DE ${catalogo.pessoa.toUpperCase()}
Contas:
${lista(catalogo.contas)}
Cartões:
${lista(catalogo.cartoes)}
Categorias:
${lista(catalogo.categorias)}

CONTAS FIXAS EXISTENTES (já cadastradas; pagamento do mês não é lançamento novo)
${catalogo.contasFixas.map((n) => `- ${n}`).join("\n") || "- (nenhuma)"}

HISTÓRICO (nome → categoria · método · conta/cartão mais recentes)
${hist || "- (sem histórico)"}`;
}

export function mensagemUsuarioInterpretar(texto: string, hoje: CalendarDate): string {
  return `Hoje é ${formatCalendarDateISO(hoje)}. Frase: """${texto.trim()}"""`;
}

/** Garante que ids devolvidos existem no catálogo; o que não existe vira null + dúvida. */
export function saneiaInterpretacao(l: LancamentoInterpretado, catalogo: CatalogoIA): LancamentoInterpretado {
  const contas = new Set(catalogo.contas.map((c) => c.id));
  const cartoes = new Set(catalogo.cartoes.map((c) => c.id));
  const categorias = new Set(catalogo.categorias.map((c) => c.id));
  const duvidas = [...l.duvidas];
  let destino_id = l.destino_id;
  if (l.tipo === "Saida" && l.metodo === "Crédito" && destino_id && !cartoes.has(destino_id)) {
    destino_id = null;
    duvidas.push("O cartão indicado não existe no catálogo.");
  }
  if ((l.tipo === "Entrada" || (l.tipo === "Saida" && l.metodo === "Débito")) && destino_id && !contas.has(destino_id)) {
    destino_id = null;
    duvidas.push("A conta indicada não existe no catálogo.");
  }
  let categoria_id = l.categoria_id;
  if (categoria_id && !categorias.has(categoria_id)) {
    categoria_id = null;
    duvidas.push("A categoria indicada não existe no catálogo.");
  }
  const de_conta_id = l.de_conta_id && contas.has(l.de_conta_id) ? l.de_conta_id : null;
  const para_conta_id = l.para_conta_id && contas.has(l.para_conta_id) ? l.para_conta_id : null;
  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(l.data);
  if (!dataOk) duvidas.push("Não entendi a data; confira.");
  return {
    ...l,
    // Conta fixa existente nunca vira contrato novo, mesmo que a IA marque os dois.
    conta_fixa: l.conta_fixa_existente ? false : l.conta_fixa,
    destino_id,
    categoria_id,
    de_conta_id,
    para_conta_id,
    parcelas: Math.max(1, Math.min(48, Math.round(l.parcelas || 1))),
    confianca: Math.max(0, Math.min(1, l.confianca)),
    duvidas,
  };
}
