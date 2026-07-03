import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { ChipLink } from "@/components/ui/chip-link";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { addMonths, hoje, isSameMonth, type CalendarDate } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";
import { faturaAtualCents, limiteComprometidoCents, limiteDisponivelCents } from "@/lib/domain/fatura";
import { agruparParcelas, parcelasFuturas } from "@/lib/domain/parcelas-futuras";
import { labelMes } from "@/lib/format/meses";
import { CartoesList, type CartaoView } from "./cartoes-list";
import type { Cartao, Categoria, Pessoa, Saida } from "@/lib/domain/types";

type Escopo = Pessoa | "Casal";

function cartoesHref(escopo: Escopo, mes: CalendarDate) {
  return `/cartoes?pessoa=${escopo}&ano=${mes.year}&mes=${mes.month}`;
}

export default async function CartoesPage({
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

  let cartoesQuery = supabase
    .from("cartao")
    .select("id, nome, dono, tipo, limite_cents, dia_fechamento, dia_vencimento, conta_vinculada_id")
    .order("nome");
  if (escopo !== "Casal") cartoesQuery = cartoesQuery.eq("dono", escopo);

  const [{ data: cartoes }, { data: saidas }, { data: contas }, { data: categorias }] = await Promise.all([
    cartoesQuery,
    supabase
      .from("saida")
      .select(
        "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, editado_por"
      )
      .not("cartao_id", "is", null),
    supabase.from("conta").select("id, nome"),
    supabase.from("categoria").select("id, nome, dono").order("nome"),
  ]);

  const todosCartoes = (cartoes ?? []) as Cartao[];
  const todasSaidas = (saidas ?? []) as Saida[];
  const grupos = agruparParcelas(todasSaidas);
  const contaPorId = new Map(((contas ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));
  const categoriaPorId = new Map(((categorias ?? []) as Categoria[]).map((c) => [c.id, c.nome]));

  const views: CartaoView[] = todosCartoes.map((cartao) => {
    const saidasCartao = todasSaidas.filter((s) => s.cartao_id === cartao.id);
    const comprometido = limiteComprometidoCents(cartao.id, saidasCartao);
    const compras = saidasCartao
      .filter((s) => isSameMonth(dataParaCalculo(s), mesReferencia))
      .sort((a, b) => ((a.data ?? a.created_at) < (b.data ?? b.created_at) ? 1 : -1));
    const futuras = grupos
      .filter((g) => g.cartaoId === cartao.id)
      .flatMap((g) => parcelasFuturas(g, mesReferencia).map((p) => ({ ...p, nomeBase: g.nomeBase })));

    return {
      cartao,
      faturaAtual: faturaAtualCents(cartao.id, saidasCartao, mesReferencia),
      comprometido,
      disponivel: limiteDisponivelCents(cartao.limite_cents, comprometido),
      contaVinculadaNome: cartao.conta_vinculada_id ? contaPorId.get(cartao.conta_vinculada_id) ?? null : null,
      compras,
      parcelasFuturas: futuras.map((f) => ({
        id: f.id,
        nomeBase: f.nomeBase,
        parcela: f.parcela,
        totalCents: f.total_cents,
      })),
      categoriaNomePorId: Object.fromEntries(categoriaPorId),
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Cartões" subtitle={escopo === "Casal" ? "Cartões do casal" : `Cartões de ${escopo}`}>
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={cartoesHref(escopo, mesAnterior)}
          hrefSeguinte={cartoesHref(escopo, mesSeguinte)}
        />
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-1.5">
        <ChipLink label={ativa} selected={escopo === ativa} href={cartoesHref(ativa, mesReferencia)} />
        <ChipLink label="Casal" selected={escopo === "Casal"} href={cartoesHref("Casal", mesReferencia)} />
      </div>

      {views.length === 0 ? (
        <div className="rounded-md border border-hairline bg-surface p-8 text-center">
          <p className="type-body text-ink-2">Nenhum cartão cadastrado para este escopo.</p>
        </div>
      ) : (
        <CartoesList cartoes={views} categorias={(categorias ?? []) as Categoria[]} mesLabel={labelMes(mesReferencia)} />
      )}
    </main>
  );
}
