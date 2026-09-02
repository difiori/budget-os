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
  saidasMes: number;
  entradasMes: number;
  saldoInicioTotal: number;
  saldoPrevistoTotal: number;
}

/**
 * Uso da renda de uma pessoa no mês: saídas do mês sobre o DISPONÍVEL (saldo
 * no início do mês + entradas do mês). Só entradas como base escondia o que
 * sobrou do mês anterior — uma entrada grande em agosto sumia da leitura de
 * setembro. A composição fica visível embaixo, pra o número não ser mágico.
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
  const pct = usoDoDisponivelPct(resumo.saidasMes, resumo.saldoInicioTotal, resumo.entradasMes);
  const barColor = pct === null ? "bg-track" : pct > 100 ? "bg-neg" : pct > 80 ? "bg-warn" : "bg-pos";
  const mesMinusculo = MESES[mesReferencia.month - 1].toLowerCase();

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
          {resumo.saidasMes > 0
            ? `Sem disponível positivo no mês: ${formatCentsToBRL(resumo.saidasMes)} em saídas.`
            : "Sem movimentações neste mês."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <ProgressBar percent={pct} colorClassName={barColor} />
          <p className="type-caption text-ink-2">
            <span className="figures">{formatCentsToBRL(resumo.saidasMes)}</span> de{" "}
            <span className="figures">{formatCentsToBRL(disponivel)}</span> disponíveis usados
          </p>
        </div>
      )}

      {/* De onde vem o disponível: saldo que entrou no mês + entradas do mês. */}
      <dl className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-caption text-ink-3">Saldo em 1º de {mesMinusculo}</dt>
          <dd>
            <Amount cents={resumo.saldoInicioTotal} className="type-caption figures text-ink-2" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-caption text-ink-3">Entradas do mês</dt>
          <dd>
            <Amount cents={resumo.entradasMes} semantic="none" className="type-caption figures text-ink-2" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="type-caption text-ink-3">Saídas do mês</dt>
          <dd>
            <Amount cents={resumo.saidasMes} semantic="none" className="type-caption figures text-ink-2" />
          </dd>
        </div>
      </dl>

      <div className="flex items-baseline justify-between border-t border-hairline pt-3">
        <p className="type-caption text-ink-3">Saldo previsto</p>
        <Amount cents={resumo.saldoPrevistoTotal} className="type-body font-medium text-ink" />
      </div>
    </Card>
  );
}
