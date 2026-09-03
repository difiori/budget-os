import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { EscopoChips } from "@/components/ui/escopo-chips";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import { FixaTag } from "@/components/ui/fixa-tag";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { addMonths, hoje, isSameMonth, type CalendarDate } from "@/lib/domain/calendar-date";
import { resolverEscopo, type Escopo } from "@/lib/domain/escopo";
import { resumoContaMes } from "@/lib/domain/mes";
import {
  categoriasComparadas,
  entradasNoMes,
  fixasVsVariaveis,
  maioresSaidas,
  saidasComVencimentoNoMes,
  taxaPoupancaPct,
  variacao,
  type Variacao,
} from "@/lib/domain/fechamento";
import { formatCentsToBRL } from "@/lib/domain/money";
import type { DadosFechamento } from "@/lib/ia/narrativa-fechamento";
import { LeituraDoMes } from "./leitura-do-mes";
import type { ContaFixa } from "@/lib/domain/types";
import { labelMes, MESES_ABREV } from "@/lib/format/meses";
import type { Categoria, Conta, Entrada, Saida } from "@/lib/domain/types";

function monthHref(pessoa: Escopo, mes: CalendarDate) {
  return `/mes?pessoa=${pessoa}&ano=${mes.year}&mes=${mes.month}`;
}

/** Variação contra o mês anterior. `subirEhRuim` inverte a cor (saídas). */
function Delta({ v, subirEhRuim = false, contra }: { v: Variacao; subirEhRuim?: boolean; contra: string }) {
  if (v.abs === 0) return <p className="type-caption text-ink-3">igual a {contra}</p>;
  const subiu = v.abs > 0;
  const bom = subirEhRuim ? !subiu : subiu;
  const sinal = subiu ? "+" : "−";
  return (
    <p className={`type-caption figures ${bom ? "text-pos" : "text-neg"}`}>
      {sinal}
      {formatCentsToBRL(Math.abs(v.abs))}
      {v.pct !== null && ` (${sinal}${Math.round(Math.abs(v.pct))}%)`} vs {contra}
    </p>
  );
}

export default async function MesPage({
  searchParams,
}: {
  searchParams: Promise<{ pessoa?: string; ano?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const ativa = await pessoaAtiva();
  const pessoa = resolverEscopo(params.pessoa, ativa);

  const referencia = hoje();
  const mesReferencia: CalendarDate = {
    year: params.ano ? Number(params.ano) : referencia.year,
    month: params.mes ? Number(params.mes) : referencia.month,
    day: 1,
  };
  const mesAnterior = addMonths(mesReferencia, -1);
  const mesSeguinte = addMonths(mesReferencia, 1);
  const contra = MESES_ABREV[mesAnterior.month - 1];

  let contasQuery = supabase.from("conta").select("id, nome, dono, saldo_atual_cents").order("nome");
  if (pessoa !== "Casal") contasQuery = contasQuery.eq("dono", pessoa);

  // Paginado (fetchAllRows): a tabela `saida` passa de 1000 linhas e o limite
  // padrão do PostgREST truncaria o saldo previsto por conta.
  const mesISO = `${mesReferencia.year}-${String(mesReferencia.month).padStart(2, "0")}-01`;
  const [contasResp, saidasTodas, entradasTodas, categoriasResp, cartoesResp, contratosResp, narrativaResp] = await Promise.all([
    contasQuery,
    fetchAllRows<Saida>((from, to) => {
      let q = supabase
        .from("saida")
        .select(
          "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, recorrente_id"
        );
      if (pessoa !== "Casal") q = q.eq("pessoa", pessoa);
      return q.order("id").range(from, to);
    }),
    fetchAllRows<Entrada>((from, to) => {
      let q = supabase
        .from("entrada")
        .select("id, nome, quantia_cents, valor_recebido_cents, data, pessoa, status, conta_destino_id, notas, created_at");
      if (pessoa !== "Casal") q = q.eq("pessoa", pessoa);
      return q.order("id").range(from, to);
    }),
    supabase.from("categoria").select("id, nome, dono").order("nome"),
    supabase.from("cartao").select("id, nome, conta_vinculada_id"),
    supabase.from("recorrente").select("id, nome, total_cents, pessoa"),
    supabase.from("fechamento_narrativa").select("texto, hash, gerado_em").eq("mes", mesISO).eq("escopo", pessoa).maybeSingle(),
  ]);

  const todasContas = (contasResp.data ?? []) as Conta[];
  const todasSaidas = saidasTodas;
  const todasEntradas = entradasTodas;
  const todasCategorias = (categoriasResp.data ?? []) as Categoria[];
  const cartoes = (cartoesResp.data ?? []) as { id: string; nome: string; conta_vinculada_id: string | null }[];
  const contaVinculadaPorCartaoId = new Map(cartoes.map((c) => [c.id, c.conta_vinculada_id]));
  const categoriaNome = new Map(todasCategorias.map((c) => [c.id, c.nome]));
  const contaNome = new Map(todasContas.map((c) => [c.id, c.nome]));
  const cartaoNome = new Map(cartoes.map((c) => [c.id, c.nome]));

  // Recortes: saídas por vencimento, entradas por data (regra 4).
  const saidasMes = saidasComVencimentoNoMes(todasSaidas, mesReferencia);
  const saidasAnt = saidasComVencimentoNoMes(todasSaidas, mesAnterior);
  const entradasMes = entradasNoMes(todasEntradas, mesReferencia);
  const entradasAnt = entradasNoMes(todasEntradas, mesAnterior);

  const soma = (xs: { total_cents: number }[]) => xs.reduce((s, x) => s + x.total_cents, 0);
  const somaE = (xs: { quantia_cents: number }[]) => xs.reduce((s, x) => s + x.quantia_cents, 0);
  const entradasTotal = somaE(entradasMes);
  const saidasTotal = soma(saidasMes);
  const resultado = entradasTotal - saidasTotal;
  const entradasAntTotal = somaE(entradasAnt);
  const saidasAntTotal = soma(saidasAnt);
  const resultadoAnt = entradasAntTotal - saidasAntTotal;
  const taxa = taxaPoupancaPct(entradasTotal, saidasTotal);
  const taxaAnt = taxaPoupancaPct(entradasAntTotal, saidasAntTotal);

  const fv = fixasVsVariaveis(saidasMes);
  const pctFixas = saidasTotal > 0 ? (fv.fixas / saidasTotal) * 100 : 0;
  const fixasSobreEntradas = entradasTotal > 0 ? (fv.fixas / entradasTotal) * 100 : null;

  const linhasCategoria = categoriasComparadas(saidasMes, saidasAnt);
  const nomeCat = (id: string | null) => (id ? categoriaNome.get(id) ?? "Categoria removida" : "Sem categoria");
  const maisSubiram = [...linhasCategoria].filter((l) => l.variacao.abs > 0).sort((a, b) => b.variacao.abs - a.variacao.abs).slice(0, 3);
  const maisCairam = [...linhasCategoria].filter((l) => l.variacao.abs < 0).sort((a, b) => a.variacao.abs - b.variacao.abs).slice(0, 3);

  const maiores = maioresSaidas(saidasMes, 8);
  const destino = (s: Saida) =>
    (s.metodo === "Débito" ? contaNome.get(s.conta_id ?? "") : cartaoNome.get(s.cartao_id ?? "")) ?? "—";
  const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

  // Contas fixas que fugiram do previsto neste mês (só as do escopo).
  const previstoPorContrato = new Map(
    ((contratosResp.data ?? []) as Pick<ContaFixa, "id" | "nome" | "total_cents" | "pessoa">[])
      .filter((c) => pessoa === "Casal" || c.pessoa === pessoa)
      .map((c) => [c.id, c])
  );
  const fixasDivergentes = saidasMes
    .filter((s) => s.recorrente_id && previstoPorContrato.has(s.recorrente_id))
    .map((s) => {
      const c = previstoPorContrato.get(s.recorrente_id!)!;
      return { nome: c.nome, previsto: c.total_cents, real: s.total_cents };
    })
    .filter((d) => d.previsto !== d.real)
    .sort((a, b) => Math.abs(b.real - b.previsto) - Math.abs(a.real - a.previsto))
    .slice(0, 6);

  const dadosFechamento: DadosFechamento = {
    mesLabel: labelMes(mesReferencia),
    mesAnteriorLabel: contra,
    escopo: pessoa,
    entradas: entradasTotal,
    saidas: saidasTotal,
    resultado,
    entradasAnterior: entradasAntTotal,
    saidasAnterior: saidasAntTotal,
    resultadoAnterior: resultadoAnt,
    taxaPoupancaPct: taxa === null ? null : Math.round(taxa * 10) / 10,
    taxaPoupancaAnteriorPct: taxaAnt === null ? null : Math.round(taxaAnt * 10) / 10,
    fixas: {
      total: fv.fixas,
      quantidade: fv.nFixas,
      pctDasSaidas: Math.round(pctFixas),
      pctDasEntradas: fixasSobreEntradas === null ? null : Math.round(fixasSobreEntradas),
    },
    variaveis: { total: fv.variaveis, quantidade: fv.nVariaveis },
    categorias: linhasCategoria.slice(0, 12).map((l) => ({ nome: nomeCat(l.categoriaId), atual: l.atual, anterior: l.anterior })),
    maioresSaidas: maiores.map((s) => ({ nome: s.nome, valor: s.total_cents, categoria: nomeCat(s.categoria_id), dia: ddmm(s.vencimento) })),
    fixasDivergentes,
  };
  const narrativa = narrativaResp.data as { texto: string; hash: string; gerado_em: string } | null;

  const saldoPorConta = todasContas.map((conta) => ({
    conta,
    saldoPrevisto: resumoContaMes(conta, todasSaidas, todasEntradas, mesReferencia, contaVinculadaPorCartaoId).saldoPrevisto,
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Resumo Mensal" subtitle={`Fechamento de ${labelMes(mesReferencia)} · ${pessoa === "Casal" ? "casal" : pessoa}`}>
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={monthHref(pessoa, mesAnterior)}
          hrefSeguinte={monthHref(pessoa, mesSeguinte)}
          hrefHoje={isSameMonth(mesReferencia, referencia) ? undefined : monthHref(pessoa, referencia)}
        />
      </PageHeader>

      <EscopoChips ativa={ativa} escopo={pessoa} href={(e) => monthHref(e, mesReferencia)} />

      {/* Fechamento: os quatro números do mês, cada um contra o mês anterior. */}
      <Card variant="raised" className="p-6">
        <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <div>
            <dt className="type-caption text-ink-3">Entradas</dt>
            <dd className="type-headline mt-1 text-ink">
              <Amount cents={entradasTotal} semantic="none" />
            </dd>
            <Delta v={variacao(entradasTotal, entradasAntTotal)} contra={contra} />
          </div>
          <div>
            <dt className="type-caption text-ink-3">Saídas</dt>
            <dd className="type-headline mt-1 text-ink">
              <Amount cents={saidasTotal} semantic="none" />
            </dd>
            <Delta v={variacao(saidasTotal, saidasAntTotal)} subirEhRuim contra={contra} />
          </div>
          <div>
            <dt className="type-caption text-ink-3">Resultado</dt>
            <dd className="type-headline mt-1">
              <Amount cents={resultado} semantic="both" />
            </dd>
            <Delta v={variacao(resultado, resultadoAnt)} contra={contra} />
          </div>
          <div>
            <dt className="type-caption text-ink-3">Taxa de poupança</dt>
            <dd className={`type-headline figures mt-1 ${taxa === null ? "text-ink-3" : taxa >= 0 ? "text-pos" : "text-neg"}`}>
              {taxa === null ? "—" : `${Math.round(taxa)}%`}
            </dd>
            <p className="type-caption text-ink-3">
              {taxa === null
                ? "sem entradas no mês"
                : taxaAnt === null
                  ? "do que entrou, sobrou"
                  : `${contra}: ${Math.round(taxaAnt)}%`}
            </p>
          </div>
        </dl>
      </Card>

      <section className="mt-5">
        <LeituraDoMes
          mesISO={mesISO}
          escopo={pessoa}
          dados={dadosFechamento}
          existente={narrativa ? { texto: narrativa.texto, hash: narrativa.hash, geradoEm: narrativa.gerado_em } : null}
          iaDisponivel={!!process.env.ANTHROPIC_API_KEY}
        />
      </section>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Fixas x variáveis */}
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <h2 className="type-title text-ink">Fixas x variáveis</h2>
            <p className="type-caption text-ink-3">quanto do mês já estava comprometido</p>
          </div>
          <Card className="flex flex-col gap-4">
            <ProgressBar percent={pctFixas} colorClassName="bg-ink-2" heightClassName="h-2" minPercent={0} />
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="type-caption flex items-center gap-1.5 text-ink-3">
                  Contas fixas <FixaTag />
                </dt>
                <dd className="type-title mt-1 text-ink">
                  <Amount cents={fv.fixas} semantic="none" />
                </dd>
                <p className="type-caption text-ink-3">
                  {fv.nFixas} {fv.nFixas === 1 ? "lançamento" : "lançamentos"} · {Math.round(pctFixas)}% das saídas
                </p>
              </div>
              <div className="text-right">
                <dt className="type-caption text-ink-3">Variáveis</dt>
                <dd className="type-title mt-1 text-ink">
                  <Amount cents={fv.variaveis} semantic="none" />
                </dd>
                <p className="type-caption text-ink-3">
                  {fv.nVariaveis} {fv.nVariaveis === 1 ? "lançamento" : "lançamentos"} · {Math.round(100 - pctFixas)}%
                </p>
              </div>
            </dl>
            {fixasSobreEntradas !== null && (
              <p className="type-caption border-t border-hairline pt-3 text-ink-2">
                As contas fixas comprometem <span className="figures font-medium text-ink">{Math.round(fixasSobreEntradas)}%</span> das
                entradas do mês.
              </p>
            )}
          </Card>
        </section>

        {/* Maiores saídas */}
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <h2 className="type-title text-ink">Maiores saídas</h2>
            <p className="type-caption text-ink-3">as 8 que mais pesaram</p>
          </div>
          <Card>
            {maiores.length === 0 ? (
              <p className="type-body py-4 text-center text-ink-2">Sem saídas neste mês.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline">
                {maiores.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-1.5 text-[0.875rem] text-ink">
                        <span className="truncate">{s.nome}</span>
                        {s.recorrente_id && <FixaTag />}
                      </p>
                      <p className="type-caption truncate text-ink-3">
                        {nomeCat(s.categoria_id)} · {s.metodo} · {destino(s)} · {ddmm(s.vencimento)}
                      </p>
                    </div>
                    {pessoa === "Casal" && <PersonTag pessoa={s.pessoa} />}
                    <Amount cents={s.total_cents} semantic="none" className="shrink-0 text-[0.875rem] font-medium text-ink" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {/* Categorias: atual x anterior */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="type-title text-ink">Categorias · {MESES_ABREV[mesReferencia.month - 1]} x {contra}</h2>
          <p className="type-caption text-ink-3">por vencimento · gasto que sobe em granada, que cai em verde</p>
        </div>
        <Card className="flex flex-col gap-4">
          {(maisSubiram.length > 0 || maisCairam.length > 0) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-b border-hairline pb-3">
              {maisSubiram.length > 0 && (
                <p className="type-caption text-ink-2">
                  <span className="text-neg">Subiram mais:</span>{" "}
                  {maisSubiram.map((l) => `${nomeCat(l.categoriaId)} (+${formatCentsToBRL(l.variacao.abs)})`).join(" · ")}
                </p>
              )}
              {maisCairam.length > 0 && (
                <p className="type-caption text-ink-2">
                  <span className="text-pos">Caíram mais:</span>{" "}
                  {maisCairam.map((l) => `${nomeCat(l.categoriaId)} (−${formatCentsToBRL(-l.variacao.abs)})`).join(" · ")}
                </p>
              )}
            </div>
          )}
          {linhasCategoria.length === 0 ? (
            <p className="type-body py-4 text-center text-ink-2">Sem saídas nos dois meses.</p>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-x-4 gap-y-2">
              <span />
              <span className="type-eyebrow text-right text-ink-3">{contra}</span>
              <span className="type-eyebrow text-right text-ink-3">{MESES_ABREV[mesReferencia.month - 1]}</span>
              <span className="type-eyebrow text-right text-ink-3">Δ</span>
              {linhasCategoria.map((l) => {
                const sinal = l.variacao.abs > 0 ? "+" : l.variacao.abs < 0 ? "−" : "";
                const cor = l.variacao.abs > 0 ? "text-neg" : l.variacao.abs < 0 ? "text-pos" : "text-ink-3";
                return (
                  <div key={l.categoriaId ?? "__sem"} className="contents">
                    <span className={`truncate text-[0.875rem] ${l.categoriaId ? "text-ink" : "text-ink-2"}`}>{nomeCat(l.categoriaId)}</span>
                    <Amount cents={l.anterior} semantic="none" className="text-right text-[0.8125rem] text-ink-3" />
                    <Amount cents={l.atual} semantic="none" className="text-right text-[0.8125rem] text-ink" />
                    <span className={`figures text-right text-[0.8125rem] ${cor}`}>
                      {l.variacao.abs === 0 ? "=" : `${sinal}${formatCentsToBRL(Math.abs(l.variacao.abs))}`}
                    </span>
                  </div>
                );
              })}
              <span className="border-t border-hairline pt-2 text-[0.875rem] font-medium text-ink">Total</span>
              <Amount cents={saidasAntTotal} semantic="none" className="border-t border-hairline pt-2 text-right text-[0.8125rem] text-ink-3" />
              <Amount cents={saidasTotal} semantic="none" className="border-t border-hairline pt-2 text-right text-[0.8125rem] font-medium text-ink" />
              <span className={`figures border-t border-hairline pt-2 text-right text-[0.8125rem] font-medium ${saidasTotal > saidasAntTotal ? "text-neg" : saidasTotal < saidasAntTotal ? "text-pos" : "text-ink-3"}`}>
                {saidasTotal === saidasAntTotal ? "=" : `${saidasTotal > saidasAntTotal ? "+" : "−"}${formatCentsToBRL(Math.abs(saidasTotal - saidasAntTotal))}`}
              </span>
            </div>
          )}
        </Card>
      </section>

      {/* Saldo previsto por conta */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="type-title text-ink">Saldo previsto por conta</h2>
          <p className="type-caption text-ink-3">saldo atual + a receber − a pagar no mês</p>
        </div>
        <Card className="flex flex-col divide-y divide-hairline">
          {saldoPorConta.length === 0 ? (
            <p className="type-body py-4 text-center text-ink-2">Nenhuma conta cadastrada.</p>
          ) : (
            saldoPorConta.map(({ conta, saldoPrevisto }) => (
              <div key={conta.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[0.875rem] text-ink">{conta.nome}</span>
                  <PersonTag pessoa={conta.dono} />
                </span>
                <Amount cents={saldoPrevisto} className="shrink-0 text-[0.875rem] font-medium text-ink" />
              </div>
            ))
          )}
        </Card>
      </section>
    </main>
  );
}
