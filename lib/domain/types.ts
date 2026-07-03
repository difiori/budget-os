export type Pessoa = "Diego" | "Vitor";
export type CategoriaDono = "Diego" | "Vitor" | "Ambos";
export type CartaoTipo = "Crédito" | "Benefício";
export type MetodoPagamento = "Débito" | "Crédito";
export type FormatoCompra = "À vista" | "Parcelado";
export type SaidaStatus =
  | "A pagar"
  | "Pago"
  | "Faturado"
  | "Fixo"
  | "Em processamento"
  | "A classificar";
export type SaidaOrigem = "Manual" | "Apple Pay" | "Parcelamento" | "Recorrente";
export type EntradaStatus = "Não recebido" | "Recebido" | "Em conta";
export type EntradaOrigem = "Manual" | "Recorrente";

/** Campos mínimos de uma saída necessários para os cálculos de domínio. */
export interface SaidaParaCalculo {
  total_cents: number;
  data: string | null;
  created_at: string;
  cartao_id: string | null;
  conta_id: string | null;
  vencimento: string | null;
}

export interface Conta {
  id: string;
  nome: string;
  dono: Pessoa;
  saldo_atual_cents: number;
}

export interface Cartao {
  id: string;
  nome: string;
  dono: Pessoa;
  tipo: CartaoTipo;
  limite_cents: number | null;
  dia_fechamento: number;
  dia_vencimento: number;
  conta_vinculada_id: string | null;
}

export interface Categoria {
  id: string;
  nome: string;
  dono: CategoriaDono;
}

export interface Saida {
  id: string;
  nome: string;
  total_cents: number;
  data: string | null;
  vencimento: string | null;
  pessoa: Pessoa;
  metodo: MetodoPagamento;
  status: SaidaStatus;
  origem: SaidaOrigem;
  categoria_id: string | null;
  conta_id: string | null;
  cartao_id: string | null;
  parcela: string | null;
  created_at: string;
  editado_por?: Pessoa;
  atualizado_em?: string;
}

export interface Transferencia {
  id: string;
  nome: string;
  valor_cents: number;
  data: string;
  pessoa: Pessoa;
  de_conta_id: string;
  para_conta_id: string;
  created_at: string;
}

export interface Entrada {
  id: string;
  nome: string;
  quantia_cents: number;
  valor_recebido_cents: number | null;
  data: string;
  pessoa: Pessoa;
  status: EntradaStatus;
  conta_destino_id: string;
  notas: string | null;
  created_at: string;
  editado_por?: Pessoa;
  atualizado_em?: string;
  origem?: EntradaOrigem;
}
