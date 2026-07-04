import type { MetodoPagamento } from "./types";

export type TipoDestino = "cartao" | "conta";

/** Débito lança direto na conta; Crédito lança no cartão (entra em fatura). */
const METODO_DESTINO: Record<MetodoPagamento, TipoDestino> = {
  Crédito: "cartao",
  Débito: "conta",
};

export function destinoParaMetodo(metodo: MetodoPagamento): TipoDestino {
  return METODO_DESTINO[metodo];
}

export const METODOS_PAGAMENTO: MetodoPagamento[] = ["Débito", "Crédito"];
