import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { ChipLink } from "@/components/ui/chip-link";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { addMonths, hoje, isSameMonth, type CalendarDate } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";
import { formatCentsToBRL } from "@/lib/domain/money";
import { labelMes } from "@/lib/format/meses";
import { AjustarSaldo } from "@/components/conta/ajustar-saldo";
import { MetasPoupanca, type MetaView } from "./metas-poupanca";
import type { Cartao, CategoriaDono, Conta, Entrada, MetaPoupanca, Pessoa, Saida } from "@/lib/domain/types";

type Escopo = Pessoa | "Casal";

function contasHref(escopo: Escopo, mes: CalendarDate) {
  return `/contas?pessoa=${escopo}&ano=${mes.year}&mes=${mes.month}`;
}

/** Cor do saldo considerando cheque especial: positivo neutro, negativo dentro
 * do limite em âmbar (usando cheque especial), abaixo do limite em granada. */
function corSaldo(saldoCents: number, limiteCents: number): string {
  if (saldoCents >= 0) return "text-ink";
  if (saldoCents >= -limiteCents) return "text-warn";
  return "text-neg";
}

export default async function ContasPage({
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

  let contasQuery = supabase
    .from("conta")
    .select("id, nome, dono, saldo_atual_cents, limite_cheque_especial_cents")
    .order("nome");
  if (escopo !== "Casal") contasQuery = contasQuery.eq("dono", escopo);

  let metasQuery = supabase
    .from("meta_poupanca")
    .select("id, nome, valor_alvo_cents, valor_atual_cents, conta_id, dono, data_alvo, created_at")
    .order("created_at");
  if (escopo !== "Casal") metasQuery = metasQuery.in("dono", [escopo, "Ambos"]);

  const [
    { data: contas },
    { data: entradas },
    { data: saidasDebito },
    saidasCartao,
    { data: cartoes },
    { data: metas },
  ] = await Promise.all([
    contasQuery,
    supabase
      .from("entrada")
      .select("id, quantia_cents, valor_recebido_cents, status, conta_destino_id, data")
      .gte("data", inicioMes)
      .lt("data", fimMes),
    supabase
      .from("saida")
      .select("id, total_cents, conta_id, vencimento")
      .eq("metodo", "Débito")
      .not("conta_id", "is", null)
      .gte("vencimento", inicioMes)
      .lt("vencimento", fimMes),
    // Paginado: as compras de cartão (sem recorte de data, pois alimentam
    // fatura/limite) passam de 1000 linhas e seriam truncadas.
    fetchAllRows<Pick<Saida, "id" | "total_cents" | "data" | "created_at" | "cartao_id" | "status">>((from, to) =>
      supabase
        .from("saida")
        .select("id, total_cents, data, created_at, cartao_id, status")
        .not("cartao_id", "is", null)
        .order("id")
        .range(from, to)
    ),
    supabase.from("cartao").select("id, nome, conta_vinculada_id"),
    metasQuery,
  ]);

  const todasContas = (contas ?? []) as Conta[];
  const todasEntradas = (entradas ?? []) as Pick<
    Entrada,
    "id" | "quantia_cents" | "valor_recebido_cents" | "status" | "conta_destino_id" | "data"
  >[];
  const todasSaidasDebito = (saidasDebito ?? []) as Pick<Saida, "id" | "total_cents" | "conta_id" | "vencimento">[];
  const todasSaidasCartao = saidasCartao;
  const todosCartoes = (cartoes ?? []) as Pick<Cartao, "id" | "nome" | "conta_vinculada_id">[];
  const todasMetas = (metas ?? []) as MetaPoupanca[];
  const contaPorId = new Map(todasContas.map((c) => [c.id, c]));

  const metaViews: MetaView[] = todasMetas.map((meta) => {
    const contaVinculada = meta.conta_id ? contaPorId.get(meta.conta_id) : undefined;
    return {
      meta,
      atualCents: contaVinculada ? contaVinculada.saldo_atual_cents : meta.valor_atual_cents,
      contaNome: contaVinculada?.nome ?? null,
    };
  });
  const donoPadrao: CategoriaDono = escopo === "Casal" ? "Ambos" : escopo;

  const views = todasContas.map((conta) => {
    const entradasConta = todasEntradas.filter((e) => e.conta_destino_id === conta.id);
    const recebidoCents = entradasConta
      .filter((e) => e.status !== "Não recebido")
      .reduce((sum, e) => sum + (e.valor_recebido_cents ?? e.quantia_cents), 0);
    const pendenteCents = entradasConta
      .filter((e) => e.status === "Não recebido")
      .reduce((sum, e) => sum + e.quantia_cents, 0);

    const gastoDebitoCents = todasSaidasDebito
      .filter((s) => s.conta_id === conta.id)
      .reduce((sum, s) => sum + s.total_cents, 0);

    const cartoesVinculados = todosCartoes.filter((c) => c.conta_vinculada_id === conta.id);
    const faturaPendenteCents = cartoesVinculados.reduce((total, cartao) => {
      const pendente = todasSaidasCartao
        .filter((s) => s.cartao_id === cartao.id)
        .filter((s) => s.status !== "Pago")
        .filter((s) => isSameMonth(dataParaCalculo(s), mesAnterior))
        .reduce((sum, s) => sum + s.total_cents, 0);
      return total + pendente;
    }, 0);

    return {
      conta,
      recebidoCents,
      pendenteCents,
      gastoDebitoCents,
      cartoesVinculados,
      faturaPendenteCents,
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Conta Bancária" subtitle={escopo === "Casal" ? "Contas do casal" : `Contas de ${escopo}`}>
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={contasHref(escopo, mesAnterior)}
          hrefSeguinte={contasHref(escopo, mesSeguinte)}
        />
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-1.5">
        <ChipLink label={ativa} selected={escopo === ativa} href={contasHref(ativa, mesReferencia)} />
        <ChipLink label="Casal" selected={escopo === "Casal"} href={contasHref("Casal", mesReferencia)} />
      </div>

      {views.length === 0 ? (
        <div className="rounded-md border border-hairline bg-surface p-8 text-center">
          <p className="type-body text-ink-2">Nenhuma conta cadastrada para este escopo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {views.map((view) => (
            <Card key={view.conta.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="type-title text-ink">{view.conta.nome}</h2>
                <PersonTag pessoa={view.conta.dono} />
              </div>

              {(() => {
                const saldo = view.conta.saldo_atual_cents;
                const limite = view.conta.limite_cheque_especial_cents ?? 0;
                return (
                  <div>
                    <p className="type-caption text-ink-3">Saldo</p>
                    <Amount cents={saldo} semantic="none" className={`type-display ${corSaldo(saldo, limite)}`} />
                    {limite > 0 && (
                      <p className="type-caption mt-0.5 text-ink-3">
                        Disponível pra gastar {formatCentsToBRL(saldo + limite)}
                        {saldo < 0
                          ? ` · usando ${formatCentsToBRL(Math.min(-saldo, limite))} de ${formatCentsToBRL(limite)}`
                          : ` · cheque especial ${formatCentsToBRL(limite)}`}
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-3">
                <div>
                  <p className="type-caption text-ink-3">Entradas no mês</p>
                  <Amount cents={view.recebidoCents} semantic="both" className="type-title" />
                  {view.pendenteCents > 0 && (
                    <p className="type-caption mt-0.5 text-warn">
                      + {formatCentsToBRL(view.pendenteCents)} a receber
                    </p>
                  )}
                </div>
                <div>
                  <p className="type-caption text-ink-3">Saídas em débito</p>
                  <Amount cents={view.gastoDebitoCents} semantic="none" className="type-title text-ink" />
                </div>
              </div>

              {view.cartoesVinculados.length > 0 && (
                <div className="border-t border-hairline pt-3">
                  <p className="type-caption text-ink-3">Cartões vinculados</p>
                  <p className="type-body mt-0.5 text-ink">
                    {view.cartoesVinculados.map((c) => c.nome).join(", ")}
                  </p>
                  {view.faturaPendenteCents > 0 && (
                    <p className="type-caption mt-1.5 text-warn">
                      Fatura a vencer: {formatCentsToBRL(view.faturaPendenteCents)} · após pagar:{" "}
                      {formatCentsToBRL(view.conta.saldo_atual_cents - view.faturaPendenteCents)}
                    </p>
                  )}
                </div>
              )}

              <div className="border-t border-hairline pt-3">
                <AjustarSaldo contaId={view.conta.id} saldoAtualCents={view.conta.saldo_atual_cents} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="type-title mb-3 text-ink">Metas de poupança</h2>
        <MetasPoupanca views={metaViews} contas={todasContas} donoPadrao={donoPadrao} />
      </section>
    </main>
  );
}
