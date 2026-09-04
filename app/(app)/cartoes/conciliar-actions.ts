"use server";

import { revalidatePath } from "next/cache";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { clienteIA, iaConfigurada, MODELO_IA, mensagemErroIA, registrarUsoIA } from "@/lib/ia/cliente";
import { FaturaExtraidaSchema, mensagemFatura, SYSTEM_PROMPT_FATURA, type FaturaExtraida } from "@/lib/ia/extrair-fatura";
import { conciliar, type Conciliacao, type ItemFatura } from "@/lib/domain/conciliacao";
import { cicloDoCartao, mesDaFatura, mesDeCobranca } from "@/lib/domain/ciclo-cartao";
import { calcularVencimento } from "@/lib/domain/vencimento";
import { formatCalendarDateISO, isSameMonth, parseCalendarDate } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";
import { labelMes } from "@/lib/format/meses";
import type { Pessoa, Saida } from "@/lib/domain/types";

const TAMANHO_MAXIMO_BYTES = 8 * 1024 * 1024;

/** Linhas que a IA às vezes devolve apesar da instrução: pagamento da fatura anterior, saldo anterior. Não são compras. */
const LINHA_DE_PAGAMENTO = /pagamento\s+(recebido|efetuado|de\s+fatura|da\s+fatura)|saldo\s+anterior|pagto\.?\s+fatura/i;
function isLinhaDePagamento(descricao: string): boolean {
  return LINHA_DE_PAGAMENTO.test(descricao);
}
const TIPOS_ACEITOS = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export type SaidaDaFatura = Pick<Saida, "id" | "nome" | "total_cents" | "data" | "created_at" | "parcela" | "status" | "categoria_id">;

export type ResultadoConciliacao =
  | { ok: true; fatura: Omit<FaturaExtraida, "itens">; conciliacao: Conciliacao<SaidaDaFatura> }
  | { ok: false; error: string };

/**
 * Lê a fatura (PDF ou foto) com a IA e concilia com as compras que o app tem
 * na fatura daquele mês, pelo ciclo real do cartão. A IA só extrai; o
 * casamento é determinístico.
 */
export async function conciliarFaturaIA(formData: FormData): Promise<ResultadoConciliacao> {
  if (!iaConfigurada()) return { ok: false, error: "IA não configurada: defina ANTHROPIC_API_KEY no servidor." };
  const arquivo = formData.get("arquivo");
  const cartaoId = String(formData.get("cartaoId") ?? "");
  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, error: "Escolha o PDF da fatura ou uma foto." };
  if (!TIPOS_ACEITOS.has(arquivo.type)) return { ok: false, error: "Formato não aceito. Use PDF, JPG, PNG ou WebP." };
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) return { ok: false, error: "Arquivo acima de 8 MB." };
  if (!cartaoId || !ano || !mes) return { ok: false, error: "Cartão ou mês inválidos." };

  const supabase = await createClient();
  const pessoa = await pessoaAtiva();
  const [{ data: cartao }, { data: saidasCartao }] = await Promise.all([
    supabase.from("cartao").select("id, nome, dono, dia_fechamento, dia_vencimento").eq("id", cartaoId).single(),
    supabase
      .from("saida")
      .select("id, nome, total_cents, data, created_at, parcela, status, categoria_id")
      .eq("cartao_id", cartaoId),
  ]);
  if (!cartao) return { ok: false, error: "Cartão não encontrado." };
  const ciclo = cicloDoCartao(cartao as { dia_fechamento: number; dia_vencimento: number });
  const mesFatura = { year: ano, month: mes, day: 1 };
  const comprasDaFatura = ((saidasCartao ?? []) as SaidaDaFatura[]).filter((s) =>
    isSameMonth(mesDaFatura(dataParaCalculo(s), ciclo), mesFatura)
  );

  const bytes = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
  const documento =
    arquivo.type === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: arquivo.type as "image/jpeg" | "image/png" | "image/webp", data: bytes },
        } as const);

  try {
    const resposta = await clienteIA().messages.parse({
      model: MODELO_IA,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT_FATURA, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [documento, { type: "text", text: mensagemFatura({ cartao: cartao.nome as string, mesFatura: labelMes(mesDeCobranca(mesFatura, ciclo)) }) }],
        },
      ],
      output_config: { effort: "high", format: zodOutputFormat(FaturaExtraidaSchema) },
    });
    const fatura = resposta.parsed_output;
    await registrarUsoIA(supabase, {
      recurso: "conciliar_fatura",
      uso: resposta.usage,
      pessoa,
      sucesso: !!fatura,
      detalhe: fatura ? `${fatura.itens.length} itens` : `stop_reason=${resposta.stop_reason}`,
    });
    if (!fatura) return { ok: false, error: "A IA não conseguiu ler o documento. Tente um PDF mais nítido." };

    const itens: ItemFatura[] = fatura.itens.filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.data) && !isLinhaDePagamento(i.descricao));
    const conciliacao = conciliar(itens, comprasDaFatura);
    const { itens: _itens, ...cabecalho } = fatura;
    void _itens;
    return { ok: true, fatura: cabecalho, conciliacao };
  } catch (e) {
    return { ok: false, error: mensagemErroIA(e) };
  }
}

/** Cria no app uma compra que existe na fatura e faltava (crédito, a pagar, sem categoria). */
export async function adicionarCompraDaFatura(input: {
  cartaoId: string;
  nome: string;
  valorCents: number;
  data: string;
  parcela: string | null;
}): Promise<{ error: string | null; id: string | null }> {
  const supabase = await createClient();
  const pessoa = await pessoaAtiva();
  const { data: cartao } = await supabase
    .from("cartao")
    .select("id, dono, dia_fechamento, dia_vencimento")
    .eq("id", input.cartaoId)
    .single();
  if (!cartao) return { error: "Cartão não encontrado.", id: null };
  if (!input.nome.trim() || !Number.isInteger(input.valorCents) || input.valorCents === 0) return { error: "Item inválido.", id: null };
  if (input.valorCents < 0) return { error: "Estorno não vira compra: ajuste ou exclua a compra original.", id: null };

  const data = parseCalendarDate(input.data);
  const vencimento = calcularVencimento(data, "Crédito", cicloDoCartao(cartao as { dia_fechamento: number; dia_vencimento: number }));
  const { data: nova, error } = await supabase
    .from("saida")
    .insert({
      nome: input.nome.trim(),
      total_cents: input.valorCents,
      data: formatCalendarDateISO(data),
      vencimento: formatCalendarDateISO(vencimento),
      pessoa: cartao.dono as Pessoa,
      metodo: "Crédito",
      status: "A pagar",
      origem: "Manual",
      categoria_id: null,
      conta_id: null,
      cartao_id: input.cartaoId,
      parcela: input.parcela,
      editado_por: pessoa,
    })
    .select("id")
    .single();
  if (error) return { error: error.message, id: null };
  for (const p of ["/cartoes", "/", "/lancamentos", "/categorias", "/mes"]) revalidatePath(p);
  return { error: null, id: nova.id as string };
}
