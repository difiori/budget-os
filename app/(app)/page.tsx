import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { UltimasSaidas } from "@/components/dashboard/ultimas-saidas";
import { getContaAtiva } from "@/lib/auth/conta-ativa";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { addMonths, hoje, type CalendarDate } from "@/lib/domain/calendar-date";
import { projecaoSaldoMeses, resumoContaMes } from "@/lib/domain/mes";
import { entradasPorMes, gastosPorMes, ultimosMeses } from "@/lib/domain/tendencia";
import { gastosPorCategoria } from "@/lib/domain/categoria-totais";
import { formatCentsToBRL } from "@/lib/domain/money";
import { labelMes, MESES_ABREV } from "@/lib/format/meses";
import type { Categoria, Conta, Entrada, Pessoa, Saida } from "@/lib/domain/types";

function pessoaResumo(
  pessoa: Pessoa,
  contas: Conta[],
  saidas: Saida[],
  entradas: Entrada[],
  mesReferencia: ReturnType<typeof hoje>,
  contaVinculadaPorCartaoId: Map<string, string | null>
) {
  const contasPessoa = contas.filter((c) => c.dono === pessoa);
  const saidasPessoa = saidas.filter((s) => s.pessoa === pessoa);
  const entradasPessoa = entradas.filter((e) => e.pessoa === pessoa);

  const saldoAtualTotal = contasPessoa.reduce((sum, conta) => sum + conta.saldo_atual_cents, 0);
  const totais = contasPessoa.reduce(
    (acc, conta) => {
      const { saldoPrevisto, aReceber, aPagar } = resumoContaMes(
        conta,
        saidasPessoa,
        entradasPessoa,
        mesReferencia,
        contaVinculadaPorCartaoId
      );
      acc.saldoPrevistoTotal += saldoPrevisto;
      acc.aReceberTotal += aReceber;
      acc.aPagarTotal += aPagar;
      return acc;
    },
    { saldoPrevistoTotal: 0, aReceberTotal: 0, aPagarTotal: 0 }
  );

  const saidasMes = gastosPorMes(saidasPessoa, [mesReferencia])[0];
  const entradasMes = entradasPorMes(entradasPessoa, [mesReferencia])[0];

  return { saldoAtualTotal, ...totais, saidasMes, entradasMes };
}

function painelHref(mes: CalendarDate) {
  return `/?ano=${mes.year}&mes=${mes.month}`;
}

/** Fração das entradas do mês já comprometida com saídas. null = sem
 * entradas registradas (estado declarado, nunca um score inventado). */
function usoDaRenda(resumo: { saidasMes: number; entradasMes: number }): number | null {
  if (resumo.entradasMes <= 0) return null;
  return (resumo.saidasMes / resumo.entradasMes) * 100;
}

function UsoDaRendaCard({
  pessoa,
  resumo,
}: {
  pessoa: Pessoa;
  resumo: ReturnType<typeof pessoaResumo>;
}) {
  const pct = usoDaRenda(resumo);
  const barColor = pct === null ? "bg-track" : pct > 100 ? "bg-neg" : pct > 80 ? "bg-warn" : "bg-pos";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <PersonTag pessoa={pessoa} />
        {pct !== null && (
          <p className="figures type-title text-ink">
            {Math.round(pct)}
            <span className="type-label text-ink-3">%</span>
          </p>
        )}
      </div>

      {pct === null ? (
        <p className="type-body text-ink-2">
          {resumo.saidasMes > 0
            ? `Sem entradas registradas no mês — ${formatCentsToBRL(resumo.saidasMes)} em saídas.`
            : "Sem movimentações neste mês."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <ProgressBar percent={pct} colorClassName={barColor} />
          <p className="type-caption text-ink-2">
            <span className="figures">{formatCentsToBRL(resumo.saidasMes)}</span> de{" "}
            <span className="figures">{formatCentsToBRL(resumo.entradasMes)}</span> das entradas usados
          </p>
        </div>
      )}

      <div className="flex items-baseline justify-between border-t border-hairline pt-3">
        <p className="type-caption text-ink-3">Saldo previsto</p>
        <Amount cents={resumo.saldoPrevistoTotal} className="type-body font-medium text-ink" />
      </div>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const referencia = hoje();
  const mesReferencia: CalendarDate = {
    year: params.ano ? Number(params.ano) : referencia.year,
    month: params.mes ? Number(params.mes) : referencia.month,
    day: 1,
  };
  const mesAnterior = addMonths(mesReferencia, -1);
  const mesSeguinte = addMonths(mesReferencia, 1);
  const meses6 = ultimosMeses(mesReferencia, 6);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const contaAtiva = (await getContaAtiva()) ?? pessoaPorEmail(user?.email) ?? "Diego";

  const saidaColunasRecentes =
    "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at";

  const [
    { data: contas },
    saidasTodas,
    entradasTodas,
    { data: categorias },
    { data: cartoes },
    { data: recentesDiego },
    { data: recentesVitor },
  ] = await Promise.all([
    supabase.from("conta").select("id, nome, dono, saldo_atual_cents"),
    // Paginado: a tabela `saida` passa de 1000 linhas, e o limite padrão do
    // PostgREST truncaria silenciosamente o cálculo do saldo previsto.
    fetchAllRows<Saida>((from, to) =>
      supabase.from("saida").select(saidaColunasRecentes).order("id").range(from, to)
    ),
    fetchAllRows<Entrada>((from, to) =>
      supabase
        .from("entrada")
        .select(
          "id, nome, quantia_cents, valor_recebido_cents, data, pessoa, status, conta_destino_id, notas, created_at"
        )
        .order("id")
        .range(from, to)
    ),
    supabase.from("categoria").select("id, nome, dono"),
    supabase.from("cartao").select("id, nome, conta_vinculada_id"),
    // "Últimas saídas" é um feed de recência: as saídas registradas mais
    // recentemente (por created_at), não por vencimento — muitas nem têm
    // vencimento. Buscadas por pessoa (a importação histórica gravou uma
    // pessoa antes da outra, então um corte único deixaria a outra de fora),
    // ordenadas pela data de criação, as 30 mais novas de cada.
    supabase
      .from("saida")
      .select(saidaColunasRecentes)
      .eq("pessoa", "Diego")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("saida")
      .select(saidaColunasRecentes)
      .eq("pessoa", "Vitor")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const todasContas = (contas ?? []) as Conta[];
  const todasSaidas = saidasTodas;
  const todasEntradas = entradasTodas;
  const todasCategorias = (categorias ?? []) as Categoria[];
  const listaCartoes = (cartoes ?? []) as { id: string; nome: string; conta_vinculada_id: string | null }[];
  const contaVinculadaPorCartaoId = new Map(listaCartoes.map((c) => [c.id, c.conta_vinculada_id]));
  const contaPorId = new Map(todasContas.map((c) => [c.id, c.nome]));
  const cartaoPorId = new Map(listaCartoes.map((c) => [c.id, c.nome]));

  const diego = pessoaResumo("Diego", todasContas, todasSaidas, todasEntradas, mesReferencia, contaVinculadaPorCartaoId);
  const vitor = pessoaResumo("Vitor", todasContas, todasSaidas, todasEntradas, mesReferencia, contaVinculadaPorCartaoId);
  const ativo = contaAtiva === "Diego" ? diego : vitor;

  const saldoAtualCasal = diego.saldoAtualTotal + vitor.saldoAtualTotal;
  const saldoPrevistoCasal = diego.saldoPrevistoTotal + vitor.saldoPrevistoTotal;

  // Projeção do casal pros próximos 6 meses (mês em foco incluso) — depende
  // só de parcelas/recorrências já lançadas, não é estimativa estatística.
  const mesesProjecao = Array.from({ length: 6 }, (_, i) => addMonths(mesReferencia, i));
  const projecao = projecaoSaldoMeses(todasContas, todasSaidas, todasEntradas, mesesProjecao, contaVinculadaPorCartaoId);

  const gastosTrend = gastosPorMes(todasSaidas, meses6);
  const entradasTrend = entradasPorMes(todasEntradas, meses6);
  const labelsTrend = meses6.map((m) => MESES_ABREV[m.month - 1]);

  const categoriaTotais = gastosPorCategoria(todasSaidas, mesReferencia);
  const categoriasOrdenadas = [...categoriaTotais.entries()]
    .map(([categoriaId, total]) => ({
      categoria: todasCategorias.find((c) => c.id === categoriaId),
      total,
    }))
    .filter((c): c is { categoria: Categoria; total: number } => Boolean(c.categoria))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const maiorCategoriaTotal = categoriasOrdenadas[0]?.total ?? 1;
  const totalCategorias = categoriasOrdenadas.reduce((sum, c) => sum + c.total, 0);

  const saidasRecentes = [...((recentesDiego ?? []) as Saida[]), ...((recentesVitor ?? []) as Saida[])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Painel" subtitle={`Vendo como ${contaAtiva}`}>
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={painelHref(mesAnterior)}
          hrefSeguinte={painelHref(mesSeguinte)}
        />
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card variant="glass" className="flex flex-col gap-5 p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="type-eyebrow text-ink-3">Saldo previsto · {labelMes(mesReferencia)}</p>
              <p className="type-hero mt-2 text-ink">
                <Amount cents={ativo.saldoPrevistoTotal} />
              </p>
              <p className="type-label mt-2 text-ink-2">
                Saldo atual <Amount cents={ativo.saldoAtualTotal} className="font-medium" />
              </p>
            </div>
            <PersonTag pessoa={contaAtiva} />
          </div>

          <div className="rule-ledger" aria-hidden="true" />

          {/* O previsto sai do saldo real + o que ainda falta acontecer no mês:
              saldo atual + a receber − a pagar. No mobile vira linhas de
              extrato; em telas maiores, duas colunas. */}
          <dl className="grid gap-2.5 sm:grid-cols-2 sm:gap-4">
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="type-caption text-ink-3">A receber no mês</dt>
              <dd className="type-body font-medium sm:mt-0.5">
                <Amount cents={ativo.aReceberTotal} semantic="none" className="text-ink" />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="type-caption text-ink-3">A pagar no mês</dt>
              <dd className="type-body font-medium sm:mt-0.5">
                <Amount cents={ativo.aPagarTotal} semantic="none" className="text-ink" />
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="flex flex-col justify-center gap-4 p-6">
          <p className="type-eyebrow text-ink-3">Casal · {labelMes(mesReferencia)}</p>
          <div className="flex flex-col divide-y divide-hairline">
            <div className="flex items-baseline justify-between py-2.5">
              <p className="type-label text-ink-2">Saldo atual</p>
              <Amount cents={saldoAtualCasal} className="type-title" />
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <p className="type-label text-ink-2">Saldo previsto</p>
              <Amount cents={saldoPrevistoCasal} className="type-title" />
            </div>
          </div>
        </Card>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="type-title text-ink">Uso da renda</h2>
          <p className="type-caption text-ink-3">quanto das entradas já foi para saídas</p>
        </div>
        {/* Duas colunas de uso (Diego, Vitor) + uma de "para onde foi" quando há
            gastos — assim a linha ocupa a largura toda, sem espaço morto. */}
        <div
          className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${
            categoriasOrdenadas.length > 0 ? "lg:grid-cols-3" : "lg:max-w-2xl"
          }`}
        >
          <UsoDaRendaCard pessoa="Diego" resumo={diego} />
          <UsoDaRendaCard pessoa="Vitor" resumo={vitor} />
          {categoriasOrdenadas.length > 0 && (
            <Card className="flex flex-col gap-3.5 sm:col-span-2 lg:col-span-1">
              <div className="flex items-baseline justify-between">
                <p className="type-title text-ink">Saídas por categoria</p>
                <p className="type-caption text-ink-3">{labelMes(mesReferencia)}</p>
              </div>
              {categoriasOrdenadas.map(({ categoria, total }) => (
                <div key={categoria.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[0.875rem] text-ink">{categoria.nome}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="type-caption figures text-ink-3">
                        {totalCategorias > 0 ? Math.round((total / totalCategorias) * 100) : 0}%
                      </span>
                      <Amount cents={total} semantic="none" className="text-[0.875rem] text-ink-2" />
                    </span>
                  </div>
                  <ProgressBar percent={(total / maiorCategoriaTotal) * 100} heightClassName="h-1" />
                </div>
              ))}
            </Card>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="type-title text-ink">Projeção — próximos 6 meses</h2>
          <p className="type-caption text-ink-3">saldo do casal, a partir do já lançado</p>
        </div>
        <Card className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          {projecao.map(({ mes, saldoTotal }, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="type-caption text-ink-3">{i === 0 ? "Este mês" : labelMes(mes)}</span>
              <Amount cents={saldoTotal} semantic="both" className="type-body font-medium" />
            </div>
          ))}
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="type-title mb-3 text-ink">Entradas x saídas — últimos 6 meses</h2>
        <Card>
          <TrendChart labels={labelsTrend} gastos={gastosTrend} entradas={entradasTrend} />
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="type-title mb-3 text-ink">Últimas saídas</h2>
        <UltimasSaidas
          saidas={saidasRecentes}
          categorias={todasCategorias}
          contaPorId={contaPorId}
          cartaoPorId={cartaoPorId}
          mesReferencia={mesReferencia}
          pessoaAtiva={contaAtiva}
        />
      </section>
    </main>
  );
}
