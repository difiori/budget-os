import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { garantirOcorrenciasDoMes } from "@/lib/contas-fixas/garantir";
import { addMonths, hoje, type CalendarDate } from "@/lib/domain/calendar-date";
import { labelMes } from "@/lib/format/meses";
import { ContasFixasView } from "./contas-fixas-view";
import type { Cartao, Categoria, Conta, ContaFixa, Saida } from "@/lib/domain/types";

function monthHref(mes: CalendarDate) {
  return `/contas-fixas?ano=${mes.year}&mes=${mes.month}`;
}

export default async function ContasFixasPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const ativa = await pessoaAtiva();
  const referencia = hoje();
  const mesReferencia: CalendarDate = {
    year: params.ano ? Number(params.ano) : referencia.year,
    month: params.mes ? Number(params.mes) : referencia.month,
    day: 1,
  };
  const mesAnterior = addMonths(mesReferencia, -1);
  const mesSeguinte = addMonths(mesReferencia, 1);
  const inicioMes = `${mesReferencia.year}-${String(mesReferencia.month).padStart(2, "0")}-01`;
  const fimMes = `${mesSeguinte.year}-${String(mesSeguinte.month).padStart(2, "0")}-01`;

  // Abrir o mês materializa as ocorrências que faltam — só deste mês.
  await garantirOcorrenciasDoMes(supabase, mesReferencia);

  const [{ data: contratos }, { data: ocorrencias }, { data: categorias }, { data: contas }, { data: cartoes }] =
    await Promise.all([
      supabase
        .from("recorrente")
        .select(
          "id, nome, total_cents, pessoa, metodo, categoria_id, conta_id, cartao_id, dia_vencimento, ativo, inicio, fim, observacao, created_at"
        )
        .order("nome"),
      supabase
        .from("saida")
        .select(
          "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, recorrente_id"
        )
        .not("recorrente_id", "is", null)
        .gte("data", inicioMes)
        .lt("data", fimMes),
      supabase.from("categoria").select("id, nome, dono").order("nome"),
      supabase.from("conta").select("id, nome, dono").order("nome"),
      supabase.from("cartao").select("id, nome, dono").order("nome"),
    ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Contas fixas" subtitle="O que se repete todo mês, num lugar só">
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={monthHref(mesAnterior)}
          hrefSeguinte={monthHref(mesSeguinte)}
        />
      </PageHeader>

      <ContasFixasView
        key={`${inicioMes}-${(ocorrencias ?? []).length}-${(contratos ?? []).length}`}
        contratos={(contratos ?? []) as ContaFixa[]}
        ocorrenciasIniciais={(ocorrencias ?? []) as Saida[]}
        categorias={(categorias ?? []) as Categoria[]}
        contas={(contas ?? []) as Pick<Conta, "id" | "nome" | "dono">[]}
        cartoes={(cartoes ?? []) as Pick<Cartao, "id" | "nome" | "dono">[]}
        pessoaAtiva={ativa}
        mesReferencia={mesReferencia}
        hoje={referencia}
      />
    </main>
  );
}
