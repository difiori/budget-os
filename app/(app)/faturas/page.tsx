import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSelector } from "@/components/ui/month-selector";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import { addMonths, hoje, isSameMonth, type CalendarDate } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";
import { faturaAtualCents, limiteComprometidoCents, limiteDisponivelCents } from "@/lib/domain/fatura";
import { agruparParcelas, parcelasFuturas } from "@/lib/domain/parcelas-futuras";
import { formatCentsToBRL } from "@/lib/domain/money";
import { labelMes, MESES } from "@/lib/format/meses";
import type { Cartao, Saida } from "@/lib/domain/types";

function faturasHref(mes: CalendarDate) {
  return `/faturas?ano=${mes.year}&mes=${mes.month}`;
}

function LimiteDoCartao({ comprometido, limite }: { comprometido: number; limite: number }) {
  const disponivel = limite - comprometido;
  const pct = (comprometido / limite) * 100;
  const estourado = disponivel < 0;
  const barColor = estourado ? "bg-neg" : pct > 80 ? "bg-warn" : "bg-pos";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <p className="type-caption text-ink-3">Limite</p>
        {estourado ? (
          <p className="type-label font-semibold text-neg">
            Excedido em <span className="figures">{formatCentsToBRL(-disponivel)}</span>
          </p>
        ) : (
          <p className="type-caption text-ink-2">
            <span className="figures">{formatCentsToBRL(disponivel)}</span> disponíveis
          </p>
        )}
      </div>
      <ProgressBar percent={pct} colorClassName={barColor} />
      <p className="type-caption text-ink-3">
        <span className="figures">{formatCentsToBRL(comprometido)}</span> comprometidos de{" "}
        <span className="figures">{formatCentsToBRL(limite)}</span> — inclui parcelas e compras ainda não pagas
      </p>
    </div>
  );
}

export default async function FaturasPage({
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

  const [{ data: cartoes }, { data: saidas }, { data: contas }] = await Promise.all([
    supabase
      .from("cartao")
      .select("id, nome, dono, tipo, limite_cents, dia_fechamento, dia_vencimento, conta_vinculada_id")
      .order("nome"),
    supabase
      .from("saida")
      .select(
        "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, parcela, created_at, editado_por"
      )
      .not("cartao_id", "is", null),
    supabase.from("conta").select("id, nome"),
  ]);

  const todasSaidas = (saidas ?? []) as Saida[];
  const grupos = agruparParcelas(todasSaidas);
  const contaPorId = new Map(((contas ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Faturas" subtitle="Cartões e ciclos de cobrança">
        <MonthSelector
          label={labelMes(mesReferencia)}
          hrefAnterior={faturasHref(mesAnterior)}
          hrefSeguinte={faturasHref(mesSeguinte)}
        />
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {((cartoes ?? []) as Cartao[]).map((cartao) => {
          const saidasCartao = todasSaidas.filter((s) => s.cartao_id === cartao.id);
          const faturaAtual = faturaAtualCents(cartao.id, saidasCartao, mesReferencia);
          const comprometido = limiteComprometidoCents(cartao.id, saidasCartao);
          const disponivel = limiteDisponivelCents(cartao.limite_cents, comprometido);
          const comprasDoCiclo = saidasCartao
            .filter((s) => isSameMonth(dataParaCalculo(s), mesReferencia))
            .sort((a, b) => ((a.data ?? a.created_at) < (b.data ?? b.created_at) ? 1 : -1));

          const parcelasFuturasDoCartao = grupos
            .filter((g) => g.cartaoId === cartao.id)
            .flatMap((g) => parcelasFuturas(g, mesReferencia).map((p) => ({ ...p, nomeBase: g.nomeBase })));

          const contaVinculada = cartao.conta_vinculada_id ? contaPorId.get(cartao.conta_vinculada_id) : null;

          return (
            <Card key={cartao.id} className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="type-title text-ink">{cartao.nome}</h2>
                  <p className="type-caption mt-0.5 text-ink-3">
                    Fecha dia {cartao.dia_fechamento} · vence dia {cartao.dia_vencimento}
                    {contaVinculada ? ` · paga por ${contaVinculada}` : " · sem conta vinculada"}
                  </p>
                </div>
                <PersonTag pessoa={cartao.dono} />
              </div>

              <div>
                <p className="type-eyebrow text-ink-3">Fatura de {MESES[mesReferencia.month - 1]}</p>
                <p className="type-headline mt-1 text-ink">
                  <Amount cents={faturaAtual} semantic="none" />
                </p>
              </div>

              {cartao.limite_cents !== null && disponivel !== null && (
                <LimiteDoCartao comprometido={comprometido} limite={cartao.limite_cents} />
              )}

              {comprasDoCiclo.length > 0 && (
                <div className="border-t border-hairline pt-4">
                  <p className="type-eyebrow mb-2.5 text-ink-3">Compras do ciclo</p>
                  <ul className="flex flex-col gap-2">
                    {comprasDoCiclo.map((s) => (
                      <li key={s.id} className="flex items-baseline justify-between gap-3">
                        <span className="type-body min-w-0 truncate text-ink">
                          {s.nome}
                          {s.parcela ? <span className="text-ink-3"> · {s.parcela}</span> : ""}
                        </span>
                        <Amount cents={s.total_cents} semantic="none" className="type-body shrink-0 text-ink-2" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parcelasFuturasDoCartao.length > 0 && (
                <div className="border-t border-hairline pt-4">
                  <p className="type-eyebrow mb-2.5 text-ink-3">Parcelas futuras</p>
                  <ul className="flex flex-col gap-1.5">
                    {parcelasFuturasDoCartao.map((s) => (
                      <li key={s.id} className="flex items-baseline justify-between gap-3">
                        <span className="type-caption min-w-0 truncate text-ink-2">
                          {s.nomeBase} · {s.parcela}
                        </span>
                        <Amount cents={s.total_cents} semantic="none" className="type-caption shrink-0 text-ink-3" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {comprasDoCiclo.length === 0 && parcelasFuturasDoCartao.length === 0 && (
                <p className="type-caption border-t border-hairline pt-4 text-ink-3">
                  Nenhuma compra neste ciclo.
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
