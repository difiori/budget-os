import { z } from "zod";

/**
 * Leitura de fatura de cartão (PDF) ou comprovante (foto) pela IA: só
 * extração, em schema fixo. A conciliação com o app é determinística
 * (lib/domain/conciliacao).
 */
export const FaturaExtraidaSchema = z.object({
  emissor: z.string().nullable(),
  /** Últimos dígitos do cartão, se aparecerem. */
  cartao_final: z.string().nullable(),
  vencimento: z.string().nullable(),
  total_cents: z.number().int().nullable(),
  itens: z.array(
    z.object({
      data: z.string(),
      descricao: z.string(),
      valor_cents: z.number().int(),
      parcela: z.string().nullable(),
    })
  ),
  observacoes: z.array(z.string()),
});

export type FaturaExtraida = z.infer<typeof FaturaExtraidaSchema>;

export const SYSTEM_PROMPT_FATURA = `Você lê faturas de cartão de crédito brasileiras (PDF) ou fotos de comprovantes e devolve as transações em dados estruturados. Regras:
- Liste TODAS as transações lançadas na fatura, uma por linha, na ordem em que aparecem. Inclua compras, assinaturas, parcelas, encargos, anuidade e IOF.
- NÃO inclua: "pagamento recebido", "saldo anterior", "total", "limite", subtotais e linhas informativas. Estornos e créditos entram com valor negativo.
- valor_cents: inteiro em centavos, sem separador. R$ 1.234,56 → 123456.
- data: ISO AAAA-MM-DD. Quando a fatura mostra só dia/mês, deduza o ano pelo período da fatura ou pelo vencimento.
- parcela: "02/10" quando a linha indicar parcela (ex.: "PARC 2/10", "2 de 10"); senão null. Tire a marcação de parcela da descrição.
- descricao: nome do estabelecimento limpo e legível, sem códigos internos, cidade ou sufixos como "BR*" quando forem ruído, mantendo o que identifica o lugar.
- total_cents: o total da fatura impresso no documento, se houver; senão null. Não some você mesmo.
- observacoes: o que não ficou legível ou ambíguo (página cortada, valor ilegível, etc.). Vazio se nada.
- Se o documento não for uma fatura nem um comprovante, devolva itens vazio e explique em observacoes.`;

export function mensagemFatura(contexto: { cartao: string; mesFatura: string }): string {
  return `Fatura do cartão "${contexto.cartao}", referente a ${contexto.mesFatura}. Extraia as transações.`;
}
