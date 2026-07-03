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
  return { error: null };
}
