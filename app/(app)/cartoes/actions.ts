"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import { isSameMonth } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";

type ActionResult = { error: string | null };

/**
 * Quita de uma vez todas as compras de uma fatura fechada (compras do cartão
 * feitas no mês-ciclo informado que ainda não estão pagas): marca cada uma como
 * "Pago" e debita o total da conta vinculada ao cartão.
 */
export async function marcarFaturaComoPaga(input: {
  cartaoId: string;
  ano: number;
  mes: number;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const editadoPor = pessoaPorEmail(user?.email);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { data: cartao } = await supabase
    .from("cartao")
    .select("conta_vinculada_id")
    .eq("id", input.cartaoId)
    .single();
  const contaVinculadaId = (cartao?.conta_vinculada_id as string | null) ?? null;
  if (!contaVinculadaId) {
    return { error: "Vincule uma conta a este cartão em Configurações para pagar a fatura." };
  }

  const { data: saidas, error: fetchError } = await supabase
    .from("saida")
    .select("id, total_cents, data, created_at, status")
    .eq("cartao_id", input.cartaoId);
  if (fetchError) return { error: fetchError.message };

  const cicloRef = { year: input.ano, month: input.mes, day: 1 };
  const aPagar = ((saidas ?? []) as { id: string; total_cents: number; data: string | null; created_at: string; status: string }[])
    .filter((s) => s.status !== "Pago")
    .filter((s) => isSameMonth(dataParaCalculo(s), cicloRef));

  if (aPagar.length === 0) return { error: "Nenhuma conta pendente nesta fatura." };

  const total = aPagar.reduce((sum, s) => sum + s.total_cents, 0);
  const ids = aPagar.map((s) => s.id);

  const { error: updateError } = await supabase
    .from("saida")
    .update({ status: "Pago", editado_por: editadoPor, atualizado_em: new Date().toISOString() })
    .in("id", ids);
  if (updateError) return { error: updateError.message };

  const { error: saldoError } = await supabase.rpc("debitar_conta", {
    p_conta_id: contaVinculadaId,
    p_valor_cents: total,
  });
  if (saldoError) {
    return { error: `Faturas marcadas como pagas, mas o saldo não foi debitado: ${saldoError.message}` };
  }

  revalidatePath("/cartoes");
  revalidatePath("/");
  revalidatePath("/mes");
  revalidatePath("/lancamentos");
  revalidatePath("/contas");
  return { error: null };
}

/**
 * Reverte `marcarFaturaComoPaga`: pega as compras do cartão+ciclo que estão
 * "Pago", devolve pra "A pagar" e credita de volta o total na conta vinculada.
 * Não distingue se foram pagas em lote ou uma a uma — assume que, pro ciclo
 * inteiro, tudo que está "Pago" hoje veio daquela ação (uso esperado: desfazer
 * logo depois de marcar, ou corrigir um mês pago por engano).
 */
export async function desfazerFaturaPaga(input: {
  cartaoId: string;
  ano: number;
  mes: number;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const editadoPor = pessoaPorEmail(user?.email);
  if (!editadoPor) return { error: "Não foi possível identificar quem está editando." };

  const { data: cartao } = await supabase
    .from("cartao")
    .select("conta_vinculada_id")
    .eq("id", input.cartaoId)
    .single();
  const contaVinculadaId = (cartao?.conta_vinculada_id as string | null) ?? null;
  if (!contaVinculadaId) {
    return { error: "Este cartão não tem conta vinculada." };
  }

  const { data: saidas, error: fetchError } = await supabase
    .from("saida")
    .select("id, total_cents, data, created_at, status")
    .eq("cartao_id", input.cartaoId);
  if (fetchError) return { error: fetchError.message };

  const cicloRef = { year: input.ano, month: input.mes, day: 1 };
  const pagas = ((saidas ?? []) as { id: string; total_cents: number; data: string | null; created_at: string; status: string }[])
    .filter((s) => s.status === "Pago")
    .filter((s) => isSameMonth(dataParaCalculo(s), cicloRef));

  if (pagas.length === 0) return { error: "Nenhuma conta paga nesta fatura pra desfazer." };

  const total = pagas.reduce((sum, s) => sum + s.total_cents, 0);
  const ids = pagas.map((s) => s.id);

  const { error: updateError } = await supabase
    .from("saida")
    .update({ status: "A pagar", editado_por: editadoPor, atualizado_em: new Date().toISOString() })
    .in("id", ids);
  if (updateError) return { error: updateError.message };

  const { error: saldoError } = await supabase.rpc("creditar_conta", {
    p_conta_id: contaVinculadaId,
    p_valor_cents: total,
  });
  if (saldoError) {
    return { error: `Faturas revertidas, mas o saldo não foi creditado de volta: ${saldoError.message}` };
  }

  revalidatePath("/cartoes");
  revalidatePath("/");
  revalidatePath("/mes");
  revalidatePath("/lancamentos");
  revalidatePath("/contas");
  return { error: null };
}
