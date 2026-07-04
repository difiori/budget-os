import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { addMonths, hoje, type CalendarDate } from "@/lib/domain/calendar-date";
import { labelMes } from "@/lib/format/meses";
import { LancamentosList } from "./lancamentos-list";
import type { Cartao, Categoria, Conta, Entrada, Saida, Transferencia } from "@/lib/domain/types";

function monthHref(mes: CalendarDate) {
  return `/lancamentos?ano=${mes.year}&mes=${mes.month}`;
}

export default async function LancamentosPage({
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

  // Busca todos os tipos do mês (casal), sem recorte por pessoa/tipo/categoria —
  // o filtro agora é 100% no cliente, instantâneo. O mês já limita o volume.
  const [saidas, entradas, transferencias, { data: categorias }, { data: contas }, { data: cartoes }] =
    await Promise.all([
      fetchAllRows<Saida>((from, to) =>
        supabase
          .from("saida")
          .select(
            "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, editado_por"
          )
          .gte("vencimento", inicioMes)
          .lt("vencimento", fimMes)
          .order("id")
          .range(from, to)
      ),
      fetchAllRows<Entrada>((from, to) =>
        supabase
          .from("entrada")
          .select(
            "id, nome, quantia_cents, valor_recebido_cents, data, pessoa, status, conta_destino_id, notas, created_at, editado_por, origem"
          )
          .gte("data", inicioMes)
          .lt("data", fimMes)
          .order("id")
          .range(from, to)
      ),
      fetchAllRows<Transferencia>((from, to) =>
        supabase
          .from("transferencia")
          .select("id, nome, valor_cents, data, pessoa, de_conta_id, para_conta_id, created_at")
          .gte("data", inicioMes)
          .lt("data", fimMes)
          .order("id")
          .range(from, to)
      ),
      supabase.from("categoria").select("id, nome, dono").order("nome"),
      supabase.from("conta").select("id, nome, dono").order("nome"),
      supabase.from("cartao").select("id, nome, dono").order("nome"),
    ]);

  const todasContas = (contas ?? []) as Conta[];
  const todosCartoes = (cartoes ?? []) as Pick<Cartao, "id" | "nome" | "dono">[];
  const contaPorId = new Map(todasContas.map((c) => [c.id, c.nome]));
  const cartaoPorId = new Map(todosCartoes.map((c) => [c.id, c.nome]));
  const todasCategorias = (categorias ?? []) as Categoria[];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Lançamentos" subtitle="Extrato do casal">
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={monthHref(mesAnterior)}
          hrefSeguinte={monthHref(mesSeguinte)}
        />
      </PageHeader>

      <LancamentosList
        // Só o mês vira `key`: trocar de mês traz dados novos e reinicia o
        // estado local (edição/remoção otimista). Os filtros são client-side e
        // não precisam de remonte.
        key={`${mesReferencia.year}-${mesReferencia.month}`}
        saidasIniciais={saidas}
        entradasIniciais={entradas}
        transferenciasIniciais={transferencias}
        categorias={todasCategorias}
        contas={todasContas}
        cartoes={todosCartoes}
        contaPorId={contaPorId}
        cartaoPorId={cartaoPorId}
        pessoaAtiva={ativa}
      />
    </main>
  );
}
