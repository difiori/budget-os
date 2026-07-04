const CENTS_PER_REAL = 100;

/**
 * Converte uma string em formato BR ("1.234,56", "1234,56", "1234.56", "-50,00")
 * para centavos (integer). Nunca usar float para dinheiro.
 *
 * Aceita negativos (ex.: adiantar/abater um pagamento) e tolera espaços —
 * inclusive o NBSP que o Intl coloca em "-R$ 10,00" — e um eventual "R$",
 * para o ciclo formatar→reparsear no formulário não quebrar.
 */
export function parseCentsFromBRL(input: string): number {
  const limpo = input.replace(/\s/g, "").replace(/r\$/i, "");
  if (limpo === "" || limpo === "-") {
    throw new Error("Valor monetário vazio");
  }

  const hasComma = limpo.includes(",");
  const normalized = hasComma ? limpo.replace(/\./g, "").replace(",", ".") : limpo;

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`Valor monetário inválido: "${input}"`);
  }

  return Math.round(value * CENTS_PER_REAL);
}

export function formatCentsToBRL(cents: number): string {
  return (cents / CENTS_PER_REAL).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
