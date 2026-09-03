import type { LancamentoInterpretado } from "@/lib/ia/interpretar-lancamento";
import { formatCentsToBRL } from "@/lib/domain/money";
import type { Cartao, Conta, EntradaStatus, FormatoCompra, Pessoa, SaidaStatus } from "@/lib/domain/types";

export type Tipo = "Entrada" | "Saida" | "Transferencia";
export type Modo = "Debito" | "Credito";

/** Estado do formulário de Lançar — o que a pessoa vê e edita. */
export interface EstadoLancamento {
  tipo: Tipo;
  modo: Modo;
  nomeInput: string;
  valorInput: string;
  dataInput: string;
  destinoId: string;
  deContaId: string;
  paraContaId: string;
  categoriaId: string;
  statusSaida: SaidaStatus;
  statusEntrada: EntradaStatus;
  formato: FormatoCompra;
  numeroParcelas: string;
  recorrente: boolean;
}

export const ESTADO_PADRAO = (hojeISO: string): EstadoLancamento => ({
  tipo: "Saida",
  modo: "Debito",
  nomeInput: "",
  valorInput: "",
  dataInput: hojeISO,
  destinoId: "",
  deContaId: "",
  paraContaId: "",
  categoriaId: "",
  statusSaida: "A pagar",
  statusEntrada: "Não recebido",
  formato: "À vista",
  numeroParcelas: "2",
  recorrente: false,
});

/** Valor em centavos como o campo "Valor" espera (sem "R$"). */
export function valorParaCampo(cents: number): string {
  return formatCentsToBRL(Math.abs(cents)).replace("R$", "").trim();
}

/**
 * O que a IA entendeu → estado do formulário. É a única tradução entre os
 * dois mundos: o formulário usa para nascer pré-preenchido e o "Lançar
 * rápido" usa para o recibo e para gravar direto. Regras iguais às do
 * formulário: parcelado só no crédito e nunca junto com conta fixa.
 */
export function estadoDaInterpretacao(l: LancamentoInterpretado, hojeISO: string): EstadoLancamento {
  const base = ESTADO_PADRAO(hojeISO);
  const comum = {
    ...base,
    tipo: l.tipo,
    nomeInput: l.nome,
    valorInput: valorParaCampo(l.valor_cents),
    dataInput: /^\d{4}-\d{2}-\d{2}$/.test(l.data) ? l.data : hojeISO,
  };
  if (l.tipo === "Transferencia") {
    return { ...comum, deContaId: l.de_conta_id ?? "", paraContaId: l.para_conta_id ?? "" };
  }
  const destinoId = l.destino_id ?? "";
  const categoriaId = l.categoria_id ?? "";
  if (l.tipo === "Saida") {
    const modo: Modo = l.metodo === "Crédito" ? "Credito" : "Debito";
    const parcelado = modo === "Credito" && l.parcelas > 1;
    return {
      ...comum,
      modo,
      destinoId,
      categoriaId,
      statusSaida: l.status === "Pago" ? "Pago" : "A pagar",
      formato: parcelado ? "Parcelado" : "À vista",
      numeroParcelas: parcelado ? String(l.parcelas) : base.numeroParcelas,
      recorrente: parcelado ? false : l.conta_fixa,
    };
  }
  return {
    ...comum,
    destinoId,
    categoriaId,
    statusEntrada: l.status === "Recebido" ? "Recebido" : "Não recebido",
    recorrente: l.conta_fixa,
  };
}

export function permiteRecorrente(e: Pick<EstadoLancamento, "tipo" | "modo" | "formato">): boolean {
  return e.tipo === "Entrada" || (e.tipo === "Saida" && !(e.modo === "Credito" && e.formato === "Parcelado"));
}

/** Quem é a pessoa do lançamento: dono do destino (ou da conta de origem na transferência). */
export function pessoaDoEstado(e: EstadoLancamento, contas: Conta[], cartoes: Cartao[]): Pessoa | null {
  if (e.tipo === "Transferencia") return contas.find((c) => c.id === e.deContaId)?.dono ?? null;
  if (e.tipo === "Saida" && e.modo === "Credito") return cartoes.find((c) => c.id === e.destinoId)?.dono ?? null;
  return contas.find((c) => c.id === e.destinoId)?.dono ?? null;
}

/** O que falta para poder salvar; vazio = pode. Espelha a validação da ação. */
export function pendenciasDoEstado(e: EstadoLancamento): string[] {
  const p: string[] = [];
  if (!e.nomeInput.trim()) p.push("nome");
  if (e.tipo === "Transferencia") {
    if (!e.deContaId || !e.paraContaId || e.deContaId === e.paraContaId) p.push("contas de origem e destino");
    return p;
  }
  if (!e.destinoId) p.push(e.tipo === "Entrada" || e.modo === "Debito" ? "conta" : "cartão");
  if (e.tipo === "Saida" && !e.categoriaId) p.push("categoria");
  return p;
}

/**
 * Mesmos campos que o <form> do Lançar envia — assim o "Lançar rápido" grava
 * pela mesma ação do servidor, com as mesmas regras, sem caminho paralelo.
 */
export function formDataDoEstado(e: EstadoLancamento, contas: Conta[], cartoes: Cartao[]): FormData {
  const fd = new FormData();
  const cartao = e.tipo === "Saida" && e.modo === "Credito" ? cartoes.find((c) => c.id === e.destinoId) : undefined;
  fd.set("tipo", e.tipo);
  fd.set("modo", e.modo);
  fd.set("nome", e.nomeInput.trim());
  fd.set("valor", e.valorInput);
  fd.set("data", e.dataInput);
  fd.set("destinoId", e.destinoId);
  fd.set("deContaId", e.deContaId);
  fd.set("paraContaId", e.paraContaId);
  fd.set("categoriaId", e.categoriaId);
  fd.set("status", e.tipo === "Entrada" ? e.statusEntrada : e.statusSaida);
  fd.set("pessoa", pessoaDoEstado(e, contas, cartoes) ?? "");
  fd.set("formato", e.formato);
  fd.set("numeroParcelas", e.formato === "Parcelado" ? e.numeroParcelas : "1");
  fd.set("contaVinculadaId", cartao?.conta_vinculada_id ?? "");
  fd.set("recorrente", permiteRecorrente(e) && e.recorrente ? "true" : "false");
  return fd;
}
