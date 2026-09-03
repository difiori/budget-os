import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { EscopoChips } from "@/components/ui/escopo-chips";
import { resolverEscopo, type Escopo } from "@/lib/domain/escopo";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { addMonths, hoje, isSameMonth, type CalendarDate } from "@/lib/domain/calendar-date";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { labelMes, MESES_ABREV } from "@/lib/format/meses";
import { CategoriasList, type CategoriaView } from "./categorias-list";
import { ClassificarIA } from "@/components/categorias/classificar-ia";
import type { Categoria, Saida } from "@/lib/domain/types";


function categoriasHref(escopo: Escopo, mes: CalendarDate) {
  return `/categorias?pessoa=${escopo}&ano=${mes.year}&mes=${mes.month}`;
}

export default async function CategoriasPage({
  searchParams,
}: {
  searchParams: Promise<{ pessoa?: string; ano?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const ativa = await pessoaAtiva();
  const escopo = resolverEscopo(params.pessoa, ativa);

  const supabase = await createClient();
  const referencia = hoje();
  const mesReferencia: CalendarDate = {
    year: params.ano ? Number(params.ano) : referencia.year,
    month: params.mes ? Number(params.mes) : referencia.month,
    day: 1,
  };
  const mesAnterior = addMonths(mesReferencia, -1);
  const mesSeguinte = addMonths(mesReferencia, 1);
  const inicioMes = `${mesReferencia.year}-${String(mesReferencia.month).padStart(2, "0")}-01`;
  const inicioMesAnterior = `${mesAnterior.year}-${String(mesAnterior.month).padStart(2, "0")}-01`;
  const fimMes = `${mesSeguinte.year}-${String(mesSeguinte.month).padStart(2, "0")}-01`;

  let saidasQuery = supabase
    .from("saida")
    .select(
      "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, editado_por, recorrente_id"
    )
    .gte("vencimento", inicioMesAnterior)
    .lt("vencimento", fimMes);
  if (escopo !== "Casal") saidasQuery = saidasQuery.eq("pessoa", escopo);

  const [{ data: saidas }, { data: categorias }, { data: contas }, { data: cartoes }] = await Promise.all([
    saidasQuery,
    supabase.from("categoria").select("id, nome, dono, meta_mensal_cents").order("nome"),
    supabase.from("conta").select("id, nome"),
    supabase.from("cartao").select("id, nome"),
  ]);

  // Quantas saídas ainda estão em "Gastos Diversos" ou sem categoria no escopo
  // (todas, não só do mês) — alimenta o painel de classificação com IA.
  const iaDisponivel = !!process.env.ANTHROPIC_API_KEY;
  const gastosDiversosId = ((categorias ?? []) as Categoria[]).find((c) => c.nome === "Gastos Diversos")?.id ?? null;
  let pendentesNoTotal = 0;
  if (iaDisponivel) {
    let pq = supabase.from("saida").select("id", { count: "exact", head: true });
    pq = gastosDiversosId ? pq.or(`categoria_id.eq.${gastosDiversosId},categoria_id.is.null`) : pq.is("categoria_id", null);
    if (escopo !== "Casal") pq = pq.eq("pessoa", escopo);
    const { count } = await pq;
    pendentesNoTotal = count ?? 0;
  }

  // Dois meses numa consulta: o em foco (lista + total) e o anterior (só o
  // total, para a variação por categoria).
  const saidasDoisMeses = (saidas ?? []) as Saida[];
  const todasSaidas = saidasDoisMeses.filter((s) => (s.vencimento ?? "") >= inicioMes);
  const saidasMesAnterior = saidasDoisMeses.filter((s) => (s.vencimento ?? "") < inicioMes);
  const todasCategorias = (categorias ?? []) as Categoria[];
  const categoriasEscopo = escopo === "Casal" ? todasCategorias : categoriasParaPessoa(todasCategorias, escopo);
  const contaPorId = new Map(((contas ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));
  const cartaoPorId = new Map(((cartoes ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));

  const origemLabelPorSaidaId: Record<string, string> = {};
  for (const s of todasSaidas) {
    origemLabelPorSaidaId[s.id] =
      s.metodo === "Débito"
        ? (s.conta_id ? contaPorId.get(s.conta_id) : undefined) ?? "Conta"
        : (s.cartao_id ? cartaoPorId.get(s.cartao_id) : undefined) ?? "Cartão";
  }

  const ordenarPorData = (a: Saida, b: Saida) => ((a.data ?? a.created_at) < (b.data ?? b.created_at) ? 1 : -1);

  const totalAnteriorPorCategoria = new Map<string | null, number>();
  for (const s of saidasMesAnterior) {
    const k = s.categoria_id ?? null;
    totalAnteriorPorCategoria.set(k, (totalAnteriorPorCategoria.get(k) ?? 0) + s.total_cents);
  }

  const todasViews: CategoriaView[] = categoriasEscopo.map((categoria) => {
    const saidasCategoria = todasSaidas.filter((s) => s.categoria_id === categoria.id).sort(ordenarPorData);
    return {
      categoria,
      totalCents: saidasCategoria.reduce((sum, s) => sum + s.total_cents, 0),
      totalAnteriorCents: totalAnteriorPorCategoria.get(categoria.id) ?? 0,
      saidas: saidasCategoria,
    };
  });

  // Maior gasto primeiro; quem não teve saída no mês sai da grade e vai para
  // uma lista recolhida no fim (continua editável, inclusive a meta).
  const views = todasViews.filter((v) => v.saidas.length > 0 || v.totalAnteriorCents > 0).sort((a, b) => b.totalCents - a.totalCents);
  const semMovimento = todasViews.filter((v) => v.saidas.length === 0 && v.totalAnteriorCents === 0);

  const semCategoria = todasSaidas.filter((s) => !s.categoria_id).sort(ordenarPorData);
  if (semCategoria.length > 0) {
    views.unshift({
      categoria: null,
      totalCents: semCategoria.reduce((sum, s) => sum + s.total_cents, 0),
      totalAnteriorCents: totalAnteriorPorCategoria.get(null) ?? 0,
      saidas: semCategoria,
    });
  }
  const totalMes = todasSaidas.reduce((sum, s) => sum + s.total_cents, 0);
  const pendentesNoMes = todasSaidas.filter((s) => !s.categoria_id || s.categoria_id === gastosDiversosId).length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Categorias" subtitle={escopo === "Casal" ? "Categorias do casal" : `Categorias de ${escopo}`}>
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={categoriasHref(escopo, mesAnterior)}
          hrefSeguinte={categoriasHref(escopo, mesSeguinte)}
          hrefHoje={isSameMonth(mesReferencia, referencia) ? undefined : categoriasHref(escopo, referencia)}
        />
      </PageHeader>

      <EscopoChips ativa={ativa} escopo={escopo} href={(e) => categoriasHref(e, mesReferencia)} />

      {iaDisponivel && (
        <div className="mb-6">
          <ClassificarIA
            escopo={escopo}
            inicioMes={inicioMes}
            fimMes={fimMes}
            mesLabel={labelMes(mesReferencia)}
            pendentesNoMes={pendentesNoMes}
            pendentesNoTotal={pendentesNoTotal}
            categorias={todasCategorias}
          />
        </div>
      )}

      {todasViews.length === 0 ? (
        <div className="rounded-md border border-hairline bg-surface p-8 text-center">
          <p className="type-body text-ink-2">Nenhuma categoria cadastrada para este escopo.</p>
        </div>
      ) : (
        <CategoriasList
          views={views}
          semMovimento={semMovimento}
          totalMes={totalMes}
          mesAnteriorLabel={MESES_ABREV[mesAnterior.month - 1]}
          categorias={todasCategorias}
          origemLabelPorSaidaId={origemLabelPorSaidaId}
        />
      )}
    </main>
  );
}
