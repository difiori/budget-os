"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import type { EntradaStatus, MetodoPagamento, SaidaStatus } from "@/lib/domain/types";

type ActionResult = { error: string | null };
type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Débito lança direto na conta; crédito lança na conta vinculada ao cartão
 * (buscada fresca no servidor — não confiamos no valor vindo do cliente pra
 * uma mutação de saldo). */
async function contaAlvoDaSaida(
  supabase: Cliente,
  metodo: MetodoPagamento,
  contaId: string | null,
  cartaoId: string | null
): Promise<string | null> {
  if (metodo === "Débito") return contaId;
  if (!cartaoId) return null;
  const { data } = await supabase.from("cartao").select("conta_vinculada_id").eq("id", cartaoId).single();
  return (data?.conta_vinculada_id as string | null) ?? null;
}

async function editorAutenticado(supabase: Cliente) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return pessoaPorEmail(user?.email);
}

function revalidarTudo() {
  revalidatePath("/lancamentos");
  revalidatePath("/");
  revalidatePath("/cartoes");
  revalidatePath("/mes");
  revalidatePath("/categorias");
  revalidatePath("/contas");
}

/** Ajusta o saldo da conta-alvo pela diferença entre o efeito antigo e o novo,
 * cobrindo os 4 casos: ficou Pago com valor diferente, virou Pago, deixou de
 * ser Pago, ou não mudou nada (nenhuma chamada de RPC). */
async function ajustarSaldoSaida(
  supabase: Cliente,
  contaAlvo: string | null,
  statusAnterior: SaidaStatus,
  novoStatus: SaidaStatus,
  totalCentsAnterior: number,
  novoTotalCents: number
): Promise<string | null> {
  if (!contaAlvo) return null;

  if (statusAnterior === "Pago" && novoStatus === "Pago") {
    const delta = novoTotalCents - totalCentsAnterior;
    if (delta === 0) return null;
    const { error } = await supabase.rpc("debitar_conta", { p_conta_id: contaAlvo, p_valor_cents: delta });
    return error?.message ?? null;
  }
  if (statusAnterior !== "Pago" && novoStatus === "Pago") {
    const { error } = await supabase.rpc("debitar_conta", { p_conta_id: contaAlvo, p_valor_cents: novoTotalCents });
    return error?.message ?? null;
  }
  if (statusAnterior === "Pago" && novoStatus !== "Pago") {
    const { error } = await supabase.rpc("creditar_conta", { p_conta_id: contaAlvo, p_valor_cents: totalCentsAnterior });
    return error?.message ?? null;
  }
  return null;
}

async function ajustarSaldoEntrada(
  supabase: Cliente,
  contaDestinoId: string,
  statusAnterior: EntradaStatus,
  novoStatus: EntradaStatus,
  quantiaCentsAnterior: number,
  novaQuantiaCents: number
): Promise<string | null> {
  if (statusAnterior === "Recebido" && novoStatus === "Recebido") {
    const delta = novaQuantiaCents - quantiaCentsAnterior;
    if (delta === 0) return null;
    const { error } = await supabase.rpc("creditar_conta", { p_conta_id: contaDestinoId, p_valor_cents: delta });
    return error?.message ?? null;
  }
  if (statusAnterior !== "Recebido" && novoStatus === "Recebido") {
    const { error } = await supabase.rpc("creditar_conta", { p_conta_id: contaDestinoId, p_valor_cents: novaQuantiaCents });
    return error?.message ?? null;
  }
  if (statusAnterior === "Recebido" && novoStatus !== "Recebido") {
    const { error } = await supabase.rpc("debitar_conta", { p_conta_id: contaDestinoId, p_valor_cents: quantiaCentsAnterior });
    return error?.message ?? null;
  }
  return null;
}

export async function atualizarSaida(input: {
  id: string;
  nome: string;
  totalCents: number;
  data: string;
  vencimento: string;
  parcela: string | null;
  categoriaId: string | null;
  status: SaidaStatus;
  // estado anterior, pra calcular o efeito correto no saldo
  statusAnterior: SaidaStatus;
  totalCentsAnterior: number;
  metodo: MetodoPagamento;
  contaId: string | null;
  cartaoId: string | null;
}): Promise<ActionResult> {
  if (!input.nome.trim()) return { error: "Informe o nome." };
  if (input.totalCents === 0) return { error: "O valor não pode ser zero." };

  const supabase = await createClient();
  const editadoPor = await editorAutenticado(supabase);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { error } = await supabase
    .from("saida")
    .update({
      nome: input.nome.trim(),
      total_cents: input.totalCents,
      data: input.data,
      vencimento: input.vencimento,
      parcela: input.parcela,
      categoria_id: input.categoriaId,
      status: input.status,
      editado_por: editadoPor,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  const contaAlvo = await contaAlvoDaSaida(supabase, input.metodo, input.contaId, input.cartaoId);
  const erroSaldo = await ajustarSaldoSaida(
    supabase,
    contaAlvo,
    input.statusAnterior,
    input.status,
    input.totalCentsAnterior,
    input.totalCents
  );
  if (erroSaldo) return { error: `Lançamento salvo, mas o saldo não foi ajustado: ${erroSaldo}` };

  revalidarTudo();
  return { error: null };
}

export async function excluirSaida(input: {
  id: string;
  status: SaidaStatus;
  totalCents: number;
  metodo: MetodoPagamento;
  contaId: string | null;
  cartaoId: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("saida").delete().eq("id", input.id);
  if (error) return { error: error.message };

  if (input.status === "Pago") {
    const contaAlvo = await contaAlvoDaSaida(supabase, input.metodo, input.contaId, input.cartaoId);
    if (contaAlvo) {
      const { error: rpcError } = await supabase.rpc("creditar_conta", {
        p_conta_id: contaAlvo,
        p_valor_cents: input.totalCents,
      });
      if (rpcError) return { error: `Excluído, mas o saldo não foi revertido: ${rpcError.message}` };
    }
  }

  revalidarTudo();
  return { error: null };
}

export async function atualizarEntrada(input: {
  id: string;
  nome: string;
  quantiaCents: number;
  data: string;
  status: EntradaStatus;
  statusAnterior: EntradaStatus;
  quantiaCentsAnterior: number;
  contaDestinoId: string;
  contaDestinoIdAnterior: string;
}): Promise<ActionResult> {
  if (!input.nome.trim()) return { error: "Informe o nome." };
  if (input.quantiaCents === 0) return { error: "O valor não pode ser zero." };
  if (!input.contaDestinoId) return { error: "Selecione a conta." };

  const supabase = await createClient();
  const editadoPor = await editorAutenticado(supabase);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { error } = await supabase
    .from("entrada")
    .update({
      nome: input.nome.trim(),
      quantia_cents: input.quantiaCents,
      data: input.data,
      status: input.status,
      conta_destino_id: input.contaDestinoId,
      editado_por: editadoPor,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  if (input.contaDestinoId === input.contaDestinoIdAnterior) {
    const erroSaldo = await ajustarSaldoEntrada(
      supabase,
      input.contaDestinoId,
      input.statusAnterior,
      input.status,
      input.quantiaCentsAnterior,
      input.quantiaCents
    );
    if (erroSaldo) return { error: `Lançamento salvo, mas o saldo não foi ajustado: ${erroSaldo}` };
  } else {
    // Conta mudou: tira o efeito antigo da conta antiga e aplica o novo na nova.
    if (input.statusAnterior === "Recebido") {
      const { error: e } = await supabase.rpc("debitar_conta", {
        p_conta_id: input.contaDestinoIdAnterior,
        p_valor_cents: input.quantiaCentsAnterior,
      });
      if (e) return { error: `Lançamento salvo, mas o saldo não foi ajustado: ${e.message}` };
    }
    if (input.status === "Recebido") {
      const { error: e } = await supabase.rpc("creditar_conta", {
        p_conta_id: input.contaDestinoId,
        p_valor_cents: input.quantiaCents,
      });
      if (e) return { error: `Lançamento salvo, mas o saldo não foi ajustado: ${e.message}` };
    }
  }

  revalidarTudo();
  return { error: null };
}

export async function excluirEntrada(input: {
  id: string;
  status: EntradaStatus;
  quantiaCents: number;
  contaDestinoId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("entrada").delete().eq("id", input.id);
  if (error) return { error: error.message };

  if (input.status === "Recebido") {
    const { error: rpcError } = await supabase.rpc("debitar_conta", {
      p_conta_id: input.contaDestinoId,
      p_valor_cents: input.quantiaCents,
    });
    if (rpcError) return { error: `Excluído, mas o saldo não foi revertido: ${rpcError.message}` };
  }

  revalidarTudo();
  return { error: null };
}

/** Transferência sempre mexe no saldo (não tem status): editar o valor ajusta
 * origem e destino pela diferença; as contas não mudam na edição. */
export async function atualizarTransferencia(input: {
  id: string;
  nome: string;
  valorCents: number;
  data: string;
  valorCentsAnterior: number;
  deContaId: string;
  paraContaId: string;
}): Promise<ActionResult> {
  if (!input.nome.trim()) return { error: "Informe a descrição." };
  if (input.valorCents <= 0) return { error: "O valor precisa ser maior que zero." };

  const supabase = await createClient();
  const editadoPor = await editorAutenticado(supabase);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { error } = await supabase
    .from("transferencia")
    .update({
      nome: input.nome.trim(),
      valor_cents: input.valorCents,
      data: input.data,
      editado_por: editadoPor,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  const delta = input.valorCents - input.valorCentsAnterior;
  if (delta !== 0) {
    const { error: erroSaldo } = await supabase.rpc("transferir_entre_contas", {
      p_de_conta_id: input.deContaId,
      p_para_conta_id: input.paraContaId,
      p_valor_cents: delta,
    });
    if (erroSaldo) return { error: `Transferência salva, mas o saldo não foi ajustado: ${erroSaldo.message}` };
  }

  revalidarTudo();
  return { error: null };
}

export async function excluirTransferencia(input: {
  id: string;
  valorCents: number;
  deContaId: string;
  paraContaId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("transferencia").delete().eq("id", input.id);
  if (error) return { error: error.message };

  // Reverte invertendo origem e destino: devolve à origem, tira do destino.
  const { error: erroSaldo } = await supabase.rpc("transferir_entre_contas", {
    p_de_conta_id: input.paraContaId,
    p_para_conta_id: input.deContaId,
    p_valor_cents: input.valorCents,
  });
  if (erroSaldo) return { error: `Excluída, mas o saldo não foi revertido: ${erroSaldo.message}` };

  revalidarTudo();
  return { error: null };
}

type LoteResult = { error: string | null; feitas: number };

/** Marca várias saídas como Pago de uma vez, debitando a conta-alvo de cada
 * uma que ainda não estava paga. Só mexe no status — não toca em data,
 * vencimento nem categoria (ao contrário de `atualizarSaida`). */
export async function marcarSaidasComoPagas(ids: string[]): Promise<LoteResult> {
  if (ids.length === 0) return { error: null, feitas: 0 };
  const supabase = await createClient();
  const editadoPor = await editorAutenticado(supabase);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando.", feitas: 0 };

  const { data: rows, error } = await supabase
    .from("saida")
    .select("id, total_cents, metodo, conta_id, cartao_id, status")
    .in("id", ids);
  if (error) return { error: error.message, feitas: 0 };

  let feitas = 0;
  for (const s of (rows ?? []) as {
    id: string;
    total_cents: number;
    metodo: MetodoPagamento;
    conta_id: string | null;
    cartao_id: string | null;
    status: SaidaStatus;
  }[]) {
    if (s.status === "Pago") continue;
    const { error: upErr } = await supabase
      .from("saida")
      .update({ status: "Pago", editado_por: editadoPor, atualizado_em: new Date().toISOString() })
      .eq("id", s.id);
    if (upErr) return { error: upErr.message, feitas };
    const contaAlvo = await contaAlvoDaSaida(supabase, s.metodo, s.conta_id, s.cartao_id);
    if (contaAlvo) {
      const { error: rpcErr } = await supabase.rpc("debitar_conta", { p_conta_id: contaAlvo, p_valor_cents: s.total_cents });
      if (rpcErr) return { error: `Saída marcada, mas o saldo não foi ajustado: ${rpcErr.message}`, feitas };
    }
    feitas++;
  }
  revalidarTudo();
  return { error: null, feitas };
}

/** Marca várias entradas como Recebido, creditando a conta de destino de cada
 * uma que ainda não estava recebida. */
export async function marcarEntradasComoRecebidas(ids: string[]): Promise<LoteResult> {
  if (ids.length === 0) return { error: null, feitas: 0 };
  const supabase = await createClient();
  const editadoPor = await editorAutenticado(supabase);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando.", feitas: 0 };

  const { data: rows, error } = await supabase
    .from("entrada")
    .select("id, quantia_cents, conta_destino_id, status")
    .in("id", ids);
  if (error) return { error: error.message, feitas: 0 };

  let feitas = 0;
  for (const e of (rows ?? []) as {
    id: string;
    quantia_cents: number;
    conta_destino_id: string;
    status: EntradaStatus;
  }[]) {
    if (e.status === "Recebido") continue;
    const { error: upErr } = await supabase
      .from("entrada")
      .update({ status: "Recebido", editado_por: editadoPor, atualizado_em: new Date().toISOString() })
      .eq("id", e.id);
    if (upErr) return { error: upErr.message, feitas };
    const { error: rpcErr } = await supabase.rpc("creditar_conta", {
      p_conta_id: e.conta_destino_id,
      p_valor_cents: e.quantia_cents,
    });
    if (rpcErr) return { error: `Entrada marcada, mas o saldo não foi ajustado: ${rpcErr.message}`, feitas };
    feitas++;
  }
  revalidarTudo();
  return { error: null, feitas };
}

/** Alterna UMA saída entre "A pagar" e "Pago" e ajusta o saldo da conta-alvo.
 * Lê o estado atual no servidor (não confia no cliente pra mutação de saldo). */
export async function alternarStatusSaida(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const editadoPor = await editorAutenticado(supabase);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { data: s, error } = await supabase
    .from("saida")
    .select("total_cents, metodo, conta_id, cartao_id, status")
    .eq("id", id)
    .single();
  if (error || !s) return { error: error?.message ?? "Saída não encontrada." };

  const anterior = s.status as SaidaStatus;
  const novo: SaidaStatus = anterior === "Pago" ? "A pagar" : "Pago";

  const { error: upErr } = await supabase
    .from("saida")
    .update({ status: novo, editado_por: editadoPor, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (upErr) return { error: upErr.message };

  const contaAlvo = await contaAlvoDaSaida(
    supabase,
    s.metodo as MetodoPagamento,
    s.conta_id as string | null,
    s.cartao_id as string | null
  );
  const erroSaldo = await ajustarSaldoSaida(
    supabase,
    contaAlvo,
    anterior,
    novo,
    s.total_cents as number,
    s.total_cents as number
  );
  if (erroSaldo) return { error: `Status alterado, mas o saldo não foi ajustado: ${erroSaldo}` };

  revalidarTudo();
  return { error: null };
}

/** Alterna UMA entrada entre "Não recebido" e "Recebido" e ajusta o saldo. */
export async function alternarStatusEntrada(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const editadoPor = await editorAutenticado(supabase);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { data: e, error } = await supabase
    .from("entrada")
    .select("quantia_cents, conta_destino_id, status")
    .eq("id", id)
    .single();
  if (error || !e) return { error: error?.message ?? "Entrada não encontrada." };

  const anterior = e.status as EntradaStatus;
  const novo: EntradaStatus = anterior === "Recebido" ? "Não recebido" : "Recebido";

  const { error: upErr } = await supabase
    .from("entrada")
    .update({ status: novo, editado_por: editadoPor, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (upErr) return { error: upErr.message };

  const erroSaldo = await ajustarSaldoEntrada(
    supabase,
    e.conta_destino_id as string,
    anterior,
    novo,
    e.quantia_cents as number,
    e.quantia_cents as number
  );
  if (erroSaldo) return { error: `Status alterado, mas o saldo não foi ajustado: ${erroSaldo}` };

  revalidarTudo();
  return { error: null };
}

/** Troca a categoria de várias saídas de uma vez (não afeta saldo). */
export async function definirCategoriaEmLote(ids: string[], categoriaId: string | null): Promise<ActionResult> {
  if (ids.length === 0) return { error: null };
  const supabase = await createClient();
  const editadoPor = await editorAutenticado(supabase);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { error } = await supabase
    .from("saida")
    .update({ categoria_id: categoriaId, editado_por: editadoPor, atualizado_em: new Date().toISOString() })
    .in("id", ids);
  if (error) return { error: error.message };

  revalidarTudo();
  return { error: null };
}
