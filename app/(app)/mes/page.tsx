import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { ChipLink } from "@/components/ui/chip-link";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getContaAtiva } from "@/lib/auth/conta-ativa";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import { addMonths, hoje, type CalendarDate } from "@/lib/domain/calendar-date";
import { gastosPorCategoria } from "@/lib/domain/categoria-totais";
import { entradasDoMesCents, gastosDoMesCents, saldoPrevistoCents } from "@/lib/domain/mes";
import { labelMes } from "@/lib/format/meses";
import type { Categoria, Conta, Entrada, Pessoa, Saida } from "@/lib/domain/types";

type PessoaFiltro = Pessoa | "Casal";

function monthHref(pessoa: PessoaFiltro, mes: CalendarDate) {
  return `/mes?pessoa=${pessoa}&ano=${mes.year}&mes=${mes.month}`;
}

export default async function MesPage({
  searchParams,
}: {
  searchParams: Promise<{ pessoa?: string; ano?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let pessoa: PessoaFiltro;
  if (params.pessoa === "Diego" || params.pessoa === "Vitor" || params.pessoa === "Casal") {
    pessoa = params.pessoa;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    pessoa = (await getContaAtiva()) ?? pessoaPorEmail(user?.email) ?? "Casal";
  }

  const referencia = hoje();
  const mesReferencia: CalendarDate = {
    year: params.ano ? Number(params.ano) : referencia.year,
    month: params.mes ? Number(params.mes) : referencia.month,
    day: 1,
  };
  const mesAnterior = addMonths(mesReferencia, -1);
  const mesSeguinte = addMonths(mesReferencia, 1);

  let contasQuery = supabase.from("conta").select("id, nome, dono, saldo_atual_cents").order("nome");
  let saidasQuery = supabase
    .from("saida")
    .select(
      "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at"
    );
  let entradasQuery = supabase
    .from("entrada")
    .select("id, nome, quantia_cents, valor_recebido_cents, data, pessoa, status, conta_destino_id, notas, created_at");

  if (pessoa !== "Casal") {
    contasQuery = contasQuery.eq("dono", pessoa);
    saidasQuery = saidasQuery.eq("pessoa", pessoa);
    entradasQuery = entradasQuery.eq("pessoa", pessoa);
  }

  const [{ data: contas }, { data: saidas }, { data: entradas }, { data: categorias }] = await Promise.all([
    contasQuery,
    saidasQuery,
    entradasQuery,
    supabase.from("categoria").select("id, nome, dono").order("nome"),
  ]);

  const todasContas = (contas ?? []) as Conta[];
  const todasSaidas = (saidas ?? []) as Saida[];
  const todasEntradas = (entradas ?? []) as Entrada[];
  const todasCategorias = (categorias ?? []) as Categoria[];

  const gastosPorConta = todasContas.map((conta) => {
    const gastos = gastosDoMesCents(conta.id, todasSaidas, mesReferencia);
    const entradasConta = entradasDoMesCents(conta.id, todasEntradas, mesReferencia);
    const saldoPrevisto = saldoPrevistoCents(conta.saldo_atual_cents, entradasConta, gastos);
    return { conta, gastos, entradasConta, saldoPrevisto };
  });

  const entradasTotal = gastosPorConta.reduce((sum, c) => sum + c.entradasConta, 0);
  const gastosTotal = gastosPorConta.reduce((sum, c) => sum + c.gastos, 0);
  const resultado = entradasTotal - gastosTotal;

  const categoriaTotais = gastosPorCategoria(todasSaidas, mesReferencia);
  const categoriasOrdenadas = [...categoriaTotais.entries()]
    .map(([categoriaId, total]) => ({
      categoria: todasCategorias.find((c) => c.id === categoriaId),
      total,
    }))
    .filter((c): c is { categoria: Categoria; total: number } => Boolean(c.categoria))
    .sort((a, b) => b.total - a.total);
  const maiorCategoriaTotal = categoriasOrdenadas[0]?.total ?? 1;
  const totalCategorias = categoriasOrdenadas.reduce((sum, c) => sum + c.total, 0);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Mês" subtitle={pessoa === "Casal" ? "Visão do casal" : `Visão de ${pessoa}`}>
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={monthHref(pessoa, mesAnterior)}
          hrefSeguinte={monthHref(pessoa, mesSeguinte)}
        />
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {(["Diego", "Vitor", "Casal"] as const).map((p) => (
          <ChipLink key={p} label={p} selected={pessoa === p} href={monthHref(p, mesReferencia)} />
        ))}
      </div>

      <Card variant="raised" className="p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="type-caption text-ink-3">Entradas do mês</dt>
            <dd className="type-headline mt-1 text-ink">
              <Amount cents={entradasTotal} semantic="none" />
            </dd>
          </div>
          <div>
            <dt className="type-caption text-ink-3">Saídas do mês</dt>
            <dd className="type-headline mt-1 text-ink">
              <Amount cents={gastosTotal} semantic="none" />
            </dd>
          </div>
          <div>
            <dt className="type-caption text-ink-3">Resultado</dt>
            <dd className="type-headline mt-1">
              <Amount cents={resultado} semantic="both" />
            </dd>
          </div>
        </dl>
      </Card>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <h2 className="type-title mb-3 text-ink">Saldo previsto por conta</h2>
          <Card className="flex flex-col divide-y divide-hairline">
            {gastosPorConta.length === 0 ? (
              <p className="type-body py-4 text-center text-ink-2">Nenhuma conta cadastrada.</p>
            ) : (
              gastosPorConta.map(({ conta, saldoPrevisto }) => (
                <div key={conta.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="type-body truncate text-ink">{conta.nome}</span>
                    <PersonTag pessoa={conta.dono} />
                  </span>
                  <Amount cents={saldoPrevisto} className="type-body shrink-0 font-medium text-ink" />
                </div>
              ))
            )}
          </Card>
        </section>

        {categoriasOrdenadas.length > 0 && (
          <section>
            <h2 className="type-title mb-3 text-ink">Saídas por categoria</h2>
            <Card className="flex flex-col gap-3.5">
              {categoriasOrdenadas.map(({ categoria, total }) => (
                <div key={categoria.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="type-body truncate text-ink">{categoria.nome}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="type-caption figures text-ink-3">
                        {totalCategorias > 0 ? Math.round((total / totalCategorias) * 100) : 0}%
                      </span>
                      <Amount cents={total} semantic="none" className="type-body text-ink-2" />
                    </span>
                  </div>
                  <ProgressBar percent={(total / maiorCategoriaTotal) * 100} heightClassName="h-1" />
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>
    </main>
  );
}
