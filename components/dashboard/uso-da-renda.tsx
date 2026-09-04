import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { CalendarDate } from "@/lib/domain/calendar-date";
import { usoDoDisponivelPct } from "@/lib/domain/mes";
import { formatCentsToBRL } from "@/lib/domain/money";
import { MESES } from "@/lib/format/meses";
import type { Pessoa } from "@/lib/domain/types";

export interface ResumoUso {
  /** Saídas do mês pelas contas da pessoa (crédito resolvido pela conta do cartão). */
  saidasMes: number;
  /** Entradas do mês nas contas da pessoa. */
  entradasMes: number;
  /** Parte de `saidasMes` na categoria Investimentos: sai da conta, mas não é consumo. */
  investimentosMes: number;
  saldoInicioTotal: number;
}

/**
 * Uso da renda de uma pessoa no mês, lido como UMA equação, tudo pelas contas
 * dela: começou o mês com X, entraram Y, saíram Z, termina com X + Y − Z. O
 * percentual é Z sobre o disponível (X + Y). O "termina com" é o mesmo saldo
 * previsto do cartão de saldo, por construção — não um terceiro cálculo.
 */
export function UsoDaRendaCard({
  pessoa,
  resumo,
  mesReferencia,
}: {
  pessoa: Pessoa;
  resumo: ResumoUso;
  mesReferencia: Pick<CalendarDate, "month" | "year">;
}) {
  const disponivel = resumo.saldoInicioTotal + resumo.entradasMes;
  const consumo = resumo.saidasMes - resumo.investimentosMes;
  const termina = resumo.saldoInicioTotal + resumo.entradasMes - resumo.saidasMes;
  // O percentual mede consumo: investir não é "usar a renda".
  const pct = usoDoDisponivelPct(consumo, resumo.saldoInicioTotal, resumo.entradasMes);
  const barColor = pct === null ? "bg-track" : pct > 100 ? "bg-neg" : pct > 80 ? "bg-warn" : "bg-pos";
  const mes = MESES[mesReferencia.month - 1].toLowerCase();

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <PersonTag pessoa={pessoa} />
        {pct !== null && (
          <p className="figures type-title text-ink">
            {Math.round(pct)}
            <span className="type-label text-ink-3">%</span>
          </p>
        )}
      </div>

      {pct === null ? (
        <p className="type-body text-ink-2">
          {consumo > 0
            ? `Nada disponível para gastar em ${mes}: começou com ${formatCentsToBRL(resumo.saldoInicioTotal)} e entraram ${formatCentsToBRL(resumo.entradasMes)}.`
            : "Sem movimentações neste mês."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <ProgressBar percent={pct} colorClassName={barColor} />
          <p className="type-caption text-ink-2">
            Gastou <span className="figures">{formatCentsToBRL(consumo)}</span> dos{" "}
            <span className="figures">{formatCentsToBRL(disponivel)}</span> que havia para gastar
          </p>
        </div>
      )}

      {/* A equação, linha a linha; o resultado é o saldo previsto do mês. */}
      <dl className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-caption text-ink-3">Começou {mes} com</dt>
          <dd>
            <Amount cents={resumo.saldoInicioTotal} className="type-caption figures text-ink-2" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-caption text-ink-3">+ Entradas em {mes}</dt>
          <dd>
            <Amount cents={resumo.entradasMes} semantic="none" className="type-caption figures text-ink-2" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-caption text-ink-3">− Saídas em {mes}</dt>
          <dd>
            <Amount cents={consumo} semantic="none" className="type-caption figures text-ink-2" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-caption text-ink-3">− Investimentos</dt>
          <dd>
            <Amount cents={resumo.investimentosMes} semantic="none" className="type-caption figures text-ink-2" />
          </dd>
        </div>
      </dl>

      <div className="flex items-baseline justify-between border-t border-hairline pt-3">
        <p className="type-caption text-ink-3">Termina {mes} com</p>
        <Amount cents={termina} className="type-body font-medium text-ink" />
      </div>
    </Card>
  );
}
