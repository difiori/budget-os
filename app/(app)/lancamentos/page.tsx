import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { ChipLink } from "@/components/ui/chip-link";
import { getContaAtiva } from "@/lib/auth/conta-ativa";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import { addMonths, hoje, type CalendarDate } from "@/lib/domain/calendar-date";
import { labelMes } from "@/lib/format/meses";
import { LancamentosList } from "./lancamentos-list";
import type { Categoria, Entrada, Pessoa, Saida, Transferencia } from "@/lib/domain/types";

type PessoaFiltro = Pessoa | "Casal";
type TipoFiltro = "Ambos" | "Entrada" | "Saida";
type MetodoFiltro = "Todos" | "Debito" | "Credito";

function lancamentosHref(pessoa: PessoaFiltro, tipo: TipoFiltro, metodo: MetodoFiltro, mes: CalendarDate) {
  return `/lancamentos?pessoa=${pessoa}&tipo=${tipo}&metodo=${metodo}&ano=${mes.year}&mes=${mes.month}`;
}

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ pessoa?: string; tipo?: string; metodo?: string; ano?: string; mes?: string }>;
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

  const tipo: TipoFiltro = params.tipo === "Entrada" || params.tipo === "Saida" ? params.tipo : "Ambos";
  const metodo: MetodoFiltro =
    params.metodo === "Debito" || params.metodo === "Credito" ? params.metodo : "Todos";

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
  if (metodo !== "Todos") {
    saidasQuery = saidasQuery.eq("metodo", metodo === "Debito" ? "Débito" : "Crédito");
  }

  // Transferência não é saída nem entrada — só aparece na visão "Ambos" sem
  // filtro de método.
  const mostrarTransferencias = tipo === "Ambos" && metodo === "Todos";

  const [
    { data: saidas },
    { data: entradas },
    { data: transferencias },
    { data: categorias },
    { data: contas },
    { data: cartoes },
  ] = await Promise.all([
    tipo === "Entrada" ? Promise.resolve({ data: [] }) : saidasQuery,
    tipo === "Saida" || metodo !== "Todos" ? Promise.resolve({ data: [] }) : entradasQuery,
    mostrarTransferencias ? transferenciasQuery : Promise.resolve({ data: [] }),
    supabase.from("categoria").select("id, nome, dono"),
    supabase.from("conta").select("id, nome"),
    supabase.from("cartao").select("id, nome"),
  ]);

  const contaPorId = new Map(((contas ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));
  const cartaoPorId = new Map(((cartoes ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Lançamentos" subtitle="Extrato do mês, com edição em linha">
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={lancamentosHref(pessoa, tipo, metodo, mesAnterior)}
          hrefSeguinte={lancamentosHref(pessoa, tipo, metodo, mesSeguinte)}
        />
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-1.5">
          <span className="type-eyebrow mr-1 text-ink-3">Pessoa</span>
          {(["Diego", "Vitor", "Casal"] as const).map((p) => (
            <ChipLink key={p} label={p} selected={pessoa === p} href={lancamentosHref(p, tipo, metodo, mesReferencia)} />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="type-eyebrow mr-1 text-ink-3">Tipo</span>
          {(["Ambos", "Saida", "Entrada"] as const).map((t) => (
            <ChipLink
              key={t}
              label={t === "Saida" ? "Saídas" : t === "Entrada" ? "Entradas" : "Ambos"}
              selected={tipo === t}
              href={lancamentosHref(pessoa, t, t === "Entrada" ? "Todos" : metodo, mesReferencia)}
            />
          ))}
        </div>
        {tipo !== "Entrada" && (
          <div className="flex items-center gap-1.5">
            <span className="type-eyebrow mr-1 text-ink-3">Método</span>
            {(["Todos", "Debito", "Credito"] as const).map((m) => (
              <ChipLink
                key={m}
                label={m === "Debito" ? "Débito" : m === "Credito" ? "Crédito" : "Todos"}
                selected={metodo === m}
                href={lancamentosHref(pessoa, tipo, m, mesReferencia)}
              />
            ))}
          </div>
        )}
      </div>

      <LancamentosList
        saidasIniciais={(saidas ?? []) as Saida[]}
        entradasIniciais={(entradas ?? []) as Entrada[]}
        transferenciasIniciais={(transferencias ?? []) as Transferencia[]}
        categorias={(categorias ?? []) as Categoria[]}
        contaPorId={contaPorId}
        cartaoPorId={cartaoPorId}
      />
    </main>
  );
}
