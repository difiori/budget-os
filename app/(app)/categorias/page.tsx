import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { ChipLink } from "@/components/ui/chip-link";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { addMonths, hoje, type CalendarDate } from "@/lib/domain/calendar-date";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { labelMes } from "@/lib/format/meses";
import { CategoriasList, type CategoriaView } from "./categorias-list";
import type { Categoria, Pessoa, Saida } from "@/lib/domain/types";

type Escopo = Pessoa | "Casal";

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
  const escopo: Escopo = params.pessoa === "Casal" ? "Casal" : ativa;

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
  const fimMes = `${mesSeguinte.year}-${String(mesSeguinte.month).padStart(2, "0")}-01`;

  let saidasQuery = supabase
    .from("saida")
    .select(
      "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, editado_por"
    )
    .gte("vencimento", inicioMes)
    .lt("vencimento", fimMes);
  if (escopo !== "Casal") saidasQuery = saidasQuery.eq("pessoa", escopo);

  const [{ data: saidas }, { data: categorias }, { data: contas }, { data: cartoes }] = await Promise.all([
    saidasQuery,
    supabase.from("categoria").select("id, nome, dono, meta_mensal_cents").order("nome"),
    supabase.from("conta").select("id, nome"),
    supabase.from("cartao").select("id, nome"),
  ]);

  const todasSaidas = (saidas ?? []) as Saida[];
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

  const views: CategoriaView[] = categoriasEscopo.map((categoria) => {
    const saidasCategoria = todasSaidas.filter((s) => s.categoria_id === categoria.id).sort(ordenarPorData);
    return {
      categoria,
      totalCents: saidasCategoria.reduce((sum, s) => sum + s.total_cents, 0),
      saidas: saidasCategoria,
    };
  });

  const semCategoria = todasSaidas.filter((s) => !s.categoria_id).sort(ordenarPorData);
  if (semCategoria.length > 0) {
    views.unshift({ categoria: null, totalCents: semCategoria.reduce((sum, s) => sum + s.total_cents, 0), saidas: semCategoria });
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Categorias" subtitle={escopo === "Casal" ? "Categorias do casal" : `Categorias de ${escopo}`}>
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={categoriasHref(escopo, mesAnterior)}
          hrefSeguinte={categoriasHref(escopo, mesSeguinte)}
        />
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-1.5">
        <ChipLink label={ativa} selected={escopo === ativa} href={categoriasHref(ativa, mesReferencia)} />
        <ChipLink label="Casal" selected={escopo === "Casal"} href={categoriasHref("Casal", mesReferencia)} />
      </div>

      {views.length === 0 ? (
        <div className="rounded-md border border-hairline bg-surface p-8 text-center">
          <p className="type-body text-ink-2">Nenhuma categoria cadastrada para este escopo.</p>
        </div>
      ) : (
        <CategoriasList views={views} categorias={todasCategorias} origemLabelPorSaidaId={origemLabelPorSaidaId} />
      )}
    </main>
  );
}
