import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { UltimasSaidas } from "@/components/dashboard/ultimas-saidas";
import { ContasAPagar } from "@/components/dashboard/contas-a-pagar";
import { UsoDaRendaCard } from "@/components/dashboard/uso-da-renda";
import { Projecao } from "@/components/dashboard/projecao";
import { EntradasSaidas } from "@/components/dashboard/entradas-saidas";
import { SaidasPorCategoria } from "@/components/dashboard/saidas-por-categoria";
import { getContaAtiva } from "@/lib/auth/conta-ativa";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { addMonths, hoje, isSameMonth, type CalendarDate } from "@/lib/domain/calendar-date";
import { projecaoSaldoMeses, resumoContaMes } from "@/lib/domain/mes";
import { entradasPorMes, gastosPorMes, ultimosMeses } from "@/lib/domain/tendencia";
import { gastosPorCategoria } from "@/lib/domain/categoria-totais";
import { faturaAtualCents } from "@/lib/domain/fatura";
import { resumirLancamentos, saidasDoMesPorData } from "@/lib/domain/feed-saidas";
import { ocorrenciasVirtuais } from "@/lib/domain/conta-fixa";
import { garantirOcorrenciasDoMes } from "@/lib/contas-fixas/garantir";
import { labelMes, MESES_ABREV } from "@/lib/format/meses";
import type { Cartao, Categoria, Conta, ContaFixa, Entrada, Pessoa, Saida } from "@/lib/domain/types";

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
      const { saldoPrevisto, saldoInicio, aReceber, aPagar } = resumoContaMes(
        conta,
        saidasPessoa,
        entradasPessoa,
        mesReferencia,
        contaVinculadaPorCartaoId
      );
      acc.saldoPrevistoTotal += saldoPrevisto;
      acc.saldoInicioTotal += saldoInicio;
      acc.aReceberTotal += aReceber;
      acc.aPagarTotal += aPagar;
      return acc;
    },
    { saldoPrevistoTotal: 0, saldoInicioTotal: 0, aReceberTotal: 0, aPagarTotal: 0 }
  );

  const saidasMes = gastosPorMes(saidasPessoa, [mesReferencia])[0];
  const entradasMes = entradasPorMes(entradasPessoa, [mesReferencia])[0];

  return { saldoAtualTotal, ...totais, saidasMes, entradasMes };
}

function painelHref(mes: CalendarDate) {
  return `/?ano=${mes.year}&mes=${mes.month}`;
}

/** Cor do saldo com cheque especial: positivo neutro, negativo dentro do
 * limite em âmbar, abaixo do limite em granada. */
function corSaldo(saldoCents: number, limiteCents: number): string {
  if (saldoCents >= 0) return "text-ink";
  if (saldoCents >= -limiteCents) return "text-warn";
  return "text-neg";
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
  const inicioMes = `${mesReferencia.year}-${String(mesReferencia.month).padStart(2, "0")}-01`;
  const fimMes = `${mesSeguinte.year}-${String(mesSeguinte.month).padStart(2, "0")}-01`;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const contaAtiva = (await getContaAtiva()) ?? pessoaPorEmail(user?.email) ?? "Diego";

  const saidaColunasRecentes =
    "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, recorrente_id";

  // Contas fixas: abrir o mês materializa as ocorrências que faltam (só dele).
  await garantirOcorrenciasDoMes(supabase, mesReferencia);

  const [
    { data: contas },
    saidasTodas,
    entradasTodas,
    { data: categorias },
    { data: cartoes },
    { data: contratos },
  ] = await Promise.all([
    supabase.from("conta").select("id, nome, dono, saldo_atual_cents, limite_cheque_especial_cents"),
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
    supabase.from("cartao").select("id, nome, dono, dia_vencimento, conta_vinculada_id"),
    supabase
      .from("recorrente")
      .select("id, nome, total_cents, pessoa, metodo, categoria_id, conta_id, cartao_id, dia_vencimento, ativo, inicio, fim, created_at"),
  ]);

  const todasContas = (contas ?? []) as Conta[];
  const todasSaidas = saidasTodas;
  const todasEntradas = entradasTodas;
  const todasCategorias = (categorias ?? []) as Categoria[];
  const listaCartoes = (cartoes ?? []) as Pick<Cartao, "id" | "nome" | "dono" | "dia_vencimento" | "conta_vinculada_id">[];
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
  // Contas fixas de meses ainda não abertos não existem no banco; entram na
  // projeção como ocorrências virtuais (mesmo valor, "A pagar"), sem gravar.
  const listaContratos = (contratos ?? []) as ContaFixa[];
  const saidasProjecao = [...todasSaidas, ...ocorrenciasVirtuais(listaContratos, todasSaidas, mesesProjecao)];
  const projetar = (contas: Conta[]) =>
    projecaoSaldoMeses(contas, saidasProjecao, todasEntradas, mesesProjecao, contaVinculadaPorCartaoId).map(
      (p) => p.saldoTotal
    );
  const projecaoDiego = projetar(todasContas.filter((c) => c.dono === "Diego"));
  const projecaoVitor = projetar(todasContas.filter((c) => c.dono === "Vitor"));
  const projecaoCasal = projetar(todasContas);

  // Tendência por pessoa (pela pessoa do lançamento) e do casal, mesma janela.
  const serieDe = (pessoa?: Pessoa) => ({
    gastos: gastosPorMes(pessoa ? todasSaidas.filter((s) => s.pessoa === pessoa) : todasSaidas, meses6),
    entradas: entradasPorMes(pessoa ? todasEntradas.filter((e) => e.pessoa === pessoa) : todasEntradas, meses6),
  });
  const labelsTrend = meses6.map((m) => MESES_ABREV[m.month - 1]);

  // Saídas por categoria seguem o "Vendo como" (pela pessoa do lançamento),
  // como o saldo e as contas a pagar — não o casal.
  const saidasDaPessoa = todasSaidas.filter((s) => s.pessoa === contaAtiva);
  const categoriaTotais = gastosPorCategoria(saidasDaPessoa, mesReferencia);
  const categoriaNomePorId = new Map(todasCategorias.map((c) => [c.id, c.nome]));
  const linhasCategoria = [...categoriaTotais.entries()]
    .map(([id, total]) => ({ id, nome: categoriaNomePorId.get(id) ?? "Categoria removida", total }))
    .sort((a, b) => b.total - a.total);
  const semCategoriaTotal = saidasDaPessoa
    .filter((s) => !s.categoria_id && !!s.vencimento && s.vencimento >= inicioMes && s.vencimento < fimMes)
    .reduce((sum, s) => sum + s.total_cents, 0);

  // "Últimas saídas" é o recorte do mês em foco pela DATA DA COMPRA (não por
  // vencimento, que jogaria a compra no crédito de hoje pro mês que vem; nem
  // por created_at solto, que despejava as 12 ocorrências de um parcelamento
  // ou recorrência lançados hoje na lista deste mês). O resumo diz de onde
  // cada ocorrência veio ("12x · total", "recorrente até") sem listar irmãs.
  // Contas fixas (ocorrências de contrato) saem do feed de saídas e ganham um
  // box próprio logo abaixo, com os mesmos controles.
  const avulsas = todasSaidas.filter((s) => !s.recorrente_id);
  const saidasFeed = saidasDoMesPorData(avulsas, mesReferencia);
  const idsFeed = new Set(saidasFeed.map((s) => s.id));
  const resumosFeed = Object.fromEntries(
    [...resumirLancamentos(avulsas)].filter(([id]) => idsFeed.has(id))
  );
  const fixasFeed = saidasDoMesPorData(
    todasSaidas.filter((s) => s.recorrente_id),
    mesReferencia
  );

  // Contas a pagar do MÊS selecionado (perfil ativo): saídas ainda não pagas
  // com vencimento no mês, vencimento mais próximo primeiro.
  const pendentesMes = todasSaidas.filter(
    (s) =>
      s.pessoa === contaAtiva &&
      s.status !== "Pago" &&
      !!s.vencimento &&
      s.vencimento >= inicioMes &&
      s.vencimento < fimMes
  );
  const aPagarTotal = pendentesMes.reduce((sum, s) => sum + s.total_cents, 0);

  // Débito: listado item a item (vencimento mais próximo primeiro).
  const debitosAPagar = pendentesMes
    .filter((s) => s.metodo === "Débito")
    .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""));
  const destinoAPagar: Record<string, string> = {};
  for (const s of debitosAPagar) {
    destinoAPagar[s.id] = (s.conta_id && contaPorId.get(s.conta_id)) ?? "—";
  }

  // Crédito: agregado por cartão (a fatura do mês), com os ids pra quitar de
  // uma vez.
  const cartaoMap = new Map<string, { nome: string; totalCents: number; ids: string[] }>();
  for (const s of pendentesMes) {
    if (s.metodo !== "Crédito" || !s.cartao_id) continue;
    const atual = cartaoMap.get(s.cartao_id) ?? {
      nome: cartaoPorId.get(s.cartao_id) ?? "Cartão",
      totalCents: 0,
      ids: [],
    };
    atual.totalCents += s.total_cents;
    atual.ids.push(s.id);
    cartaoMap.set(s.cartao_id, atual);
  }
  const cartoesAPagar = [...cartaoMap.entries()]
    .map(([cartaoId, v]) => ({ cartaoId, ...v }))
    .sort((a, b) => b.totalCents - a.totalCents);

  // Contas do perfil ativo, pro detalhamento do saldo no card principal.
  const contasDaPessoa = todasContas.filter((c) => c.dono === contaAtiva);

  // Faturas dos cartões da pessoa ativa: compras do mês em foco (regras 1-2,
  // mesma base da tela Cartões), que vencem no dia do cartão do mês seguinte.
  const dd = (n: number) => String(n).padStart(2, "0");
  const faturasDoMes = listaCartoes
    .filter((c) => c.dono === contaAtiva)
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      totalCents: faturaAtualCents(c.id, todasSaidas, mesReferencia),
      vence: `${dd(c.dia_vencimento)}/${dd(mesSeguinte.month)}`,
    }))
    .filter((f) => f.totalCents !== 0)
    .sort((a, b) => b.totalCents - a.totalCents);
  const totalFaturas = faturasDoMes.reduce((sum, f) => sum + f.totalCents, 0);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Painel" subtitle={`Vendo como ${contaAtiva}`}>
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={painelHref(mesAnterior)}
          hrefSeguinte={painelHref(mesSeguinte)}
          hrefHoje={isSameMonth(mesReferencia, referencia) ? undefined : painelHref(referencia)}
        />
      </PageHeader>

      {/* Saldo e Contas a pagar dividem a linha meio a meio: a lista de contas
          precisa de largura para nome, vencimento, valor e tag na mesma linha. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card variant="glass" className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="type-eyebrow text-ink-3">Saldo atual</p>
              <p className="type-hero mt-2 text-ink">
                <Amount cents={ativo.saldoAtualTotal} />
              </p>
              <p className="type-label mt-2 text-ink-2">
                Saldo previsto · {labelMes(mesReferencia)}{" "}
                <Amount cents={ativo.saldoPrevistoTotal} className="font-medium" />
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

          {contasDaPessoa.length > 0 && (
            <div className="border-t border-hairline pt-4">
              <p className="type-eyebrow mb-2.5 text-ink-3">Saldo por conta</p>
              <ul className="flex flex-col gap-2">
                {contasDaPessoa.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[0.875rem] text-ink-2">{c.nome}</span>
                    <Amount
                      cents={c.saldo_atual_cents}
                      semantic="none"
                      className={`text-[0.875rem] font-medium ${corSaldo(
                        c.saldo_atual_cents,
                        c.limite_cheque_especial_cents ?? 0
                      )}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {faturasDoMes.length > 0 && (
            <div className="border-t border-hairline pt-4">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <p className="type-eyebrow text-ink-3">Faturas de cartão</p>
                <p className="type-caption text-ink-3">compras de {MESES_ABREV[mesReferencia.month - 1]}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {faturasDoMes.map((f) => (
                  <li key={f.id} className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-[0.875rem] text-ink-2">{f.nome}</span>
                      <span className="type-caption shrink-0 text-ink-3">vence {f.vence}</span>
                    </span>
                    <Amount cents={f.totalCents} semantic="none" className="text-[0.875rem] font-medium text-ink" />
                  </li>
                ))}
                {faturasDoMes.length > 1 && (
                  <li className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2">
                    <span className="type-caption text-ink-3">Total das faturas</span>
                    <Amount cents={totalFaturas} semantic="none" className="text-[0.875rem] font-medium text-ink" />
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Casal: fecho curto do card (atual + previsto do casal). */}
          <div className="border-t border-hairline pt-4">
            <p className="type-eyebrow mb-2.5 text-ink-3">Casal</p>
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-caption text-ink-3">Saldo atual</span>
              <Amount cents={saldoAtualCasal} className="text-[0.875rem] font-medium" />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="type-caption text-ink-3">Saldo previsto</span>
              <Amount cents={saldoPrevistoCasal} className="text-[0.875rem] font-medium" />
            </div>
          </div>
        </Card>

        <ContasAPagar
          debitos={debitosAPagar}
          destinoPorId={destinoAPagar}
          cartoes={cartoesAPagar}
          totalCents={aPagarTotal}
          fixaIds={debitosAPagar.filter((s) => s.recorrente_id).map((s) => s.id)}
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="type-title text-ink">Uso da renda</h2>
          <p className="type-caption text-ink-3">saídas do mês sobre o disponível: saldo no início do mês + entradas</p>
        </div>
        {/* Duas colunas de uso (Diego, Vitor) + uma de "para onde foi" quando há
            gastos — assim a linha ocupa a largura toda, sem espaço morto. */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <UsoDaRendaCard pessoa="Diego" resumo={diego} mesReferencia={mesReferencia} />
          <UsoDaRendaCard pessoa="Vitor" resumo={vitor} mesReferencia={mesReferencia} />
          <SaidasPorCategoria
            pessoa={contaAtiva}
            mesLabel={labelMes(mesReferencia)}
            linhas={linhasCategoria}
            semCategoria={semCategoriaTotal}
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="type-title text-ink">Projeção — próximos 6 meses</h2>
          <p className="type-caption text-ink-3">saldo previsto de cada um e do casal, a partir do já lançado</p>
        </div>
        <Projecao meses={mesesProjecao} diego={projecaoDiego} vitor={projecaoVitor} casal={projecaoCasal} />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="type-title text-ink">Entradas x saídas — últimos 6 meses</h2>
          <p className="type-caption text-ink-3">cada um e o casal, na mesma escala</p>
        </div>
        <EntradasSaidas labels={labelsTrend} diego={serieDe("Diego")} vitor={serieDe("Vitor")} casal={serieDe()} />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="type-title text-ink">Últimas saídas</h2>
          <p className="type-caption text-ink-3">compras com data em {labelMes(mesReferencia)}, da mais recente registrada</p>
        </div>
        <UltimasSaidas
          saidas={saidasFeed}
          resumos={resumosFeed}
          categorias={todasCategorias}
          contaPorId={contaPorId}
          cartaoPorId={cartaoPorId}
          mesReferencia={mesReferencia}
          hoje={referencia}
          pessoaAtiva={contaAtiva}
          verTudoHref={`/lancamentos?ano=${mesReferencia.year}&mes=${mesReferencia.month}`}
        />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="type-title text-ink">Contas fixas</h2>
          <p className="type-caption text-ink-3">cobranças dos contratos em {labelMes(mesReferencia)}, da mais próxima</p>
        </div>
        <UltimasSaidas
          saidas={fixasFeed}
          resumos={{}}
          categorias={todasCategorias}
          contaPorId={contaPorId}
          cartaoPorId={cartaoPorId}
          mesReferencia={mesReferencia}
          hoje={referencia}
          pessoaAtiva={contaAtiva}
          verTudoHref={`/contas-fixas?ano=${mesReferencia.year}&mes=${mesReferencia.month}`}
          rotulo={{ singular: "conta fixa", plural: "contas fixas", evento: "cobrança" }}
          vazio="Nenhuma conta fixa com cobrança neste mês. Cadastre em Contas fixas."
          ordenacaoInicial={{ campo: "data", direcao: "asc" }}
        />
      </section>
    </main>
  );
}
