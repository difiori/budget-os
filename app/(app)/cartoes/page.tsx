import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { ChipLink } from "@/components/ui/chip-link";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { addMonths, hoje, isSameMonth, type CalendarDate } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";
import { faturaAtualCents, limiteComprometidoCents, limiteDisponivelCents } from "@/lib/domain/fatura";
import { labelMes, MESES } from "@/lib/format/meses";
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

  const [{ data: cartoes }, saidasTodas, { data: contas }, { data: categorias }] = await Promise.all([
    cartoesQuery,
    // Paginado: sem isso, o limite de 1000 linhas do PostgREST truncaria as
    // compras de cartão e o limite comprometido (que soma parcelas futuras).
    fetchAllRows<Saida>((from, to) =>
      supabase
        .from("saida")
        .select(
          "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, editado_por"
        )
        .not("cartao_id", "is", null)
        .order("id")
        .range(from, to)
    ),
    supabase.from("conta").select("id, nome"),
    supabase.from("categoria").select("id, nome, dono").order("nome"),
  ]);

  const todosCartoes = (cartoes ?? []) as Cartao[];
  const todasSaidas = saidasTodas;
  const contaPorId = new Map(((contas ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));
  const categoriaPorId = new Map(((categorias ?? []) as Categoria[]).map((c) => [c.id, c.nome]));

  const categoriaNomePorId = Object.fromEntries(categoriaPorId);
  const ordenarPorData = (a: Saida, b: Saida) => ((a.data ?? a.created_at) < (b.data ?? b.created_at) ? 1 : -1);
  const dd = (dia: number) => String(dia).padStart(2, "0");

  const views: CartaoView[] = todosCartoes.map((cartao) => {
    const saidasCartao = todasSaidas.filter((s) => s.cartao_id === cartao.id);
    const comprometido = limiteComprometidoCents(cartao.id, saidasCartao, mesReferencia);

    // Fatura "a vencer": compras do mês anterior — fecharam e vencem agora.
    const comprasAVencer = saidasCartao
      .filter((s) => isSameMonth(dataParaCalculo(s), mesAnterior))
      .sort(ordenarPorData);
    // Fatura "do mês": compras do mês em foco — vencem no mês seguinte.
    const comprasDoMes = saidasCartao
      .filter((s) => isSameMonth(dataParaCalculo(s), mesReferencia))
      .sort(ordenarPorData);

    const pendentesAVencer = comprasAVencer.filter((s) => s.status !== "Pago");

    return {
      cartao,
      comprometido,
      disponivel: limiteDisponivelCents(cartao.limite_cents, comprometido),
      contaVinculadaNome: cartao.conta_vinculada_id ? contaPorId.get(cartao.conta_vinculada_id) ?? null : null,
      aVencer: {
        titulo: `Fatura de ${MESES[mesAnterior.month - 1]}`,
        vencimentoLabel: `vence ${dd(cartao.dia_vencimento)}/${dd(mesReferencia.month)}`,
        totalCents: faturaAtualCents(cartao.id, saidasCartao, mesAnterior),
        compras: comprasAVencer,
        temPendente: pendentesAVencer.length > 0,
        totalPendenteCents: pendentesAVencer.reduce((sum, s) => sum + s.total_cents, 0),
        cicloAno: mesAnterior.year,
        cicloMes: mesAnterior.month,
      },
      doMes: {
        titulo: `Fatura de ${MESES[mesReferencia.month - 1]}`,
        vencimentoLabel: `vence ${dd(cartao.dia_vencimento)}/${dd(mesSeguinte.month)}`,
        totalCents: faturaAtualCents(cartao.id, saidasCartao, mesReferencia),
        compras: comprasDoMes,
      },
      categoriaNomePorId,
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
