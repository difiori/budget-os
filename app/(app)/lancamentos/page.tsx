import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { ChipLink } from "@/components/ui/chip-link";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { addMonths, hoje, type CalendarDate } from "@/lib/domain/calendar-date";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { labelMes } from "@/lib/format/meses";
import { LancamentosList } from "./lancamentos-list";
import type { Categoria, Conta, Entrada, Pessoa, Saida, Transferencia } from "@/lib/domain/types";

type Escopo = Pessoa | "Casal";
type TipoFiltro = "Ambos" | "Entrada" | "Saida" | "Transferencia";
type MetodoFiltro = "Todos" | "Debito" | "Credito";

function href(opts: {
  pessoa: Escopo;
  tipo: TipoFiltro;
  metodo: MetodoFiltro;
  categoria: string;
  mes: CalendarDate;
}) {
  const { pessoa, tipo, metodo, categoria, mes } = opts;
  const cat = categoria ? `&categoria=${categoria}` : "";
  return `/lancamentos?pessoa=${pessoa}&tipo=${tipo}&metodo=${metodo}${cat}&ano=${mes.year}&mes=${mes.month}`;
}

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ pessoa?: string; tipo?: string; metodo?: string; categoria?: string; ano?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const ativa = await pessoaAtiva();
  const pessoa: Escopo = params.pessoa === "Casal" ? "Casal" : ativa;

  const tipo: TipoFiltro =
    params.tipo === "Entrada" || params.tipo === "Saida" || params.tipo === "Transferencia" ? params.tipo : "Ambos";
  const metodo: MetodoFiltro = params.metodo === "Debito" || params.metodo === "Credito" ? params.metodo : "Todos";
  const categoria = params.categoria ?? "";

  const referencia = hoje();
  const mesReferencia: CalendarDate = {
    year: params.ano ? Number(params.ano) : referencia.year,
    month: params.mes ? Number(params.mes) : referencia.month,
    day: 1,
  };
  const mesAnterior = addMonths(mesReferencia, -1);
  const mesSeguinte = addMonths(mesReferencia, 1);
  const inicioMes = `${mesReferencia.year}-${String(mesReferencia.month).padStart(2, "0")}-01`;
  const fimMes = `${addMonths(mesReferencia, 1).year}-${String(addMonths(mesReferencia, 1).month).padStart(2, "0")}-01`;

  let saidasQuery = supabase
    .from("saida")
    .select(
      "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, editado_por"
    )
    .gte("vencimento", inicioMes)
    .lt("vencimento", fimMes);
  let entradasQuery = supabase
    .from("entrada")
    .select(
      "id, nome, quantia_cents, valor_recebido_cents, data, pessoa, status, conta_destino_id, notas, created_at, editado_por, origem"
    )
    .gte("data", inicioMes)
    .lt("data", fimMes);
  let transferenciasQuery = supabase
    .from("transferencia")
    .select("id, nome, valor_cents, data, pessoa, de_conta_id, para_conta_id, created_at")
    .gte("data", inicioMes)
    .lt("data", fimMes);

  if (pessoa !== "Casal") {
    saidasQuery = saidasQuery.eq("pessoa", pessoa);
    entradasQuery = entradasQuery.eq("pessoa", pessoa);
    transferenciasQuery = transferenciasQuery.eq("pessoa", pessoa);
  }
  if (metodo !== "Todos") saidasQuery = saidasQuery.eq("metodo", metodo === "Debito" ? "Débito" : "Crédito");
  if (categoria) saidasQuery = saidasQuery.eq("categoria_id", categoria);

  // Só saídas têm categoria: com categoria escolhida ou filtro de método,
  // entradas e transferências saem de cena. Transferências também não aparecem
  // no recorte de "Entradas" nem "Saídas".
  const fetchSaidas = tipo === "Ambos" || tipo === "Saida";
  const fetchEntradas = (tipo === "Ambos" || tipo === "Entrada") && metodo === "Todos" && !categoria;
  const fetchTransfers = (tipo === "Ambos" || tipo === "Transferencia") && metodo === "Todos" && !categoria;

  const [{ data: saidas }, { data: entradas }, { data: transferencias }, { data: categorias }, { data: contas }, { data: cartoes }] =
    await Promise.all([
      fetchSaidas ? saidasQuery : Promise.resolve({ data: [] }),
      fetchEntradas ? entradasQuery : Promise.resolve({ data: [] }),
      fetchTransfers ? transferenciasQuery : Promise.resolve({ data: [] }),
      supabase.from("categoria").select("id, nome, dono").order("nome"),
      supabase.from("conta").select("id, nome, dono").order("nome"),
      supabase.from("cartao").select("id, nome"),
    ]);

  const todasContas = (contas ?? []) as Conta[];
  const contaPorId = new Map(todasContas.map((c) => [c.id, c.nome]));
  const cartaoPorId = new Map(((cartoes ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));
  const todasCategorias = (categorias ?? []) as Categoria[];

  // No escopo por pessoa, só as categorias dela (+ Ambos); no Casal, todas.
  const categoriasFiltro = pessoa === "Casal" ? todasCategorias : categoriasParaPessoa(todasCategorias, pessoa);
  // Contas oferecidas para reatribuir uma entrada seguem o mesmo escopo.
  const contasEdit = pessoa === "Casal" ? todasContas : todasContas.filter((c) => c.dono === pessoa);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Lançamentos" subtitle={pessoa === "Casal" ? "Extrato do casal" : `Extrato de ${pessoa}`}>
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={href({ pessoa, tipo, metodo, categoria, mes: mesAnterior })}
          hrefSeguinte={href({ pessoa, tipo, metodo, categoria, mes: mesSeguinte })}
        />
      </PageHeader>

      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-1.5">
            <span className="type-eyebrow mr-1 text-ink-3">Pessoa</span>
            <ChipLink label={ativa} selected={pessoa === ativa} href={href({ pessoa: ativa, tipo, metodo, categoria, mes: mesReferencia })} />
            <ChipLink label="Casal" selected={pessoa === "Casal"} href={href({ pessoa: "Casal", tipo, metodo, categoria, mes: mesReferencia })} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="type-eyebrow mr-1 text-ink-3">Tipo</span>
            {(["Ambos", "Saida", "Entrada", "Transferencia"] as const).map((t) => (
              <ChipLink
                key={t}
                label={t === "Saida" ? "Saídas" : t === "Entrada" ? "Entradas" : t === "Transferencia" ? "Transf." : "Ambos"}
                selected={tipo === t}
                href={href({
                  pessoa,
                  tipo: t,
                  metodo: t === "Entrada" || t === "Transferencia" ? "Todos" : metodo,
                  categoria: t === "Entrada" || t === "Transferencia" ? "" : categoria,
                  mes: mesReferencia,
                })}
              />
            ))}
          </div>
          {(tipo === "Ambos" || tipo === "Saida") && (
            <div className="flex items-center gap-1.5">
              <span className="type-eyebrow mr-1 text-ink-3">Método</span>
              {(["Todos", "Debito", "Credito"] as const).map((m) => (
                <ChipLink
                  key={m}
                  label={m === "Debito" ? "Débito" : m === "Credito" ? "Crédito" : "Todos"}
                  selected={metodo === m}
                  href={href({ pessoa, tipo, metodo: m, categoria, mes: mesReferencia })}
                />
              ))}
            </div>
          )}
        </div>

        {(tipo === "Ambos" || tipo === "Saida") && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-eyebrow mr-1 text-ink-3">Categoria</span>
            <ChipLink
              label="Todas"
              selected={!categoria}
              href={href({ pessoa, tipo, metodo, categoria: "", mes: mesReferencia })}
            />
            {categoriasFiltro.map((c) => (
              <ChipLink
                key={c.id}
                label={c.nome}
                selected={categoria === c.id}
                href={href({ pessoa, tipo, metodo, categoria: c.id, mes: mesReferencia })}
              />
            ))}
          </div>
        )}
      </div>

      <LancamentosList
        // A lista guarda os itens em estado local (edição/remoção otimista).
        // A key força recriar esse estado quando o recorte muda — sem ela, a
        // navegação soft do next/link reaproveita a instância e mantém os
        // lançamentos do mês/filtro anterior.
        key={`${pessoa}-${tipo}-${metodo}-${categoria}-${mesReferencia.year}-${mesReferencia.month}`}
        saidasIniciais={(saidas ?? []) as Saida[]}
        entradasIniciais={(entradas ?? []) as Entrada[]}
        transferenciasIniciais={(transferencias ?? []) as Transferencia[]}
        categorias={todasCategorias}
        contas={contasEdit.map((c) => ({ id: c.id, nome: c.nome }))}
        contaPorId={contaPorId}
        cartaoPorId={cartaoPorId}
      />
    </main>
  );
}
