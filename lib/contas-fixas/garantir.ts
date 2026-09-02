import type { SupabaseClient } from "@supabase/supabase-js";
import { type CalendarDate } from "@/lib/domain/calendar-date";
import { mesISO } from "@/lib/domain/conta-fixa";

/**
 * Garante que todo contrato de conta fixa vigente tem a sua ocorrência no mês
 * aberto — e só nele. Chamar no carregamento das telas com recorte mensal
 * (Painel, Lançamentos, Contas fixas, Cartões), antes de buscar as saídas.
 * Idempotente: repetir não duplica. Se a RPC ainda não existir (migração não
 * aplicada), a tela segue funcionando sem materializar — só registra no log.
 */
export async function garantirOcorrenciasDoMes(
  supabase: SupabaseClient,
  mes: CalendarDate
): Promise<number> {
  const { data, error } = await supabase.rpc("garantir_ocorrencias_contas_fixas", { p_mes: mesISO(mes) });
  if (error) {
    console.warn(`[contas-fixas] não foi possível garantir ocorrências de ${mesISO(mes)}: ${error.message}`);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
