const CENTS_PER_REAL = 100;

/**
 * Converte uma string em formato BR ("1.234,56" ou "1234,56" ou "1234.56")
 * para centavos (integer). Nunca usar float para dinheiro.
 */
export function parseCentsFromBRL(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error("Valor monetário vazio");
  }

  const hasComma = trimmed.includes(",");
  const normalized = hasComma
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;

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
