import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { TrendChart } from "@/components/dashboard/trend-chart";

export interface SerieMensal {
  entradas: number[];
  gastos: number[];
}

/**
 * Entradas x saídas dos últimos meses para Diego, Vitor e o casal, lado a
 * lado e na MESMA escala vertical — assim a altura das curvas é comparável
 * entre as três. Cor segue a semântica do sistema (verde entra, coral sai);
 * a pessoa fica no selo, não na cor.
 */
export function EntradasSaidas({
  labels,
  diego,
  vitor,
  casal,
}: {
  labels: string[];
  diego: SerieMensal;
  vitor: SerieMensal;
  casal: SerieMensal;
}) {
  const soma = (v: number[]) => v.reduce((s, x) => s + x, 0);
  const yMax = Math.max(0, ...casal.entradas, ...casal.gastos);
  const colunas: { chave: string; cabecalho: React.ReactNode; serie: SerieMensal }[] = [
    { chave: "Diego", cabecalho: <PersonTag pessoa="Diego" />, serie: diego },
    { chave: "Vitor", cabecalho: <PersonTag pessoa="Vitor" />, serie: vitor },
    { chave: "Casal", cabecalho: <span className="type-label text-ink">Casal</span>, serie: casal },
  ];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-ink-2">
          <span className="h-0.5 w-4 rounded-full bg-pos" aria-hidden="true" />
          <span className="type-caption">Entradas</span>
        </span>
        <span className="flex items-center gap-1.5 text-ink-2">
          <span className="h-0.5 w-4 rounded-full bg-neg" aria-hidden="true" />
          <span className="type-caption">Saídas</span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {colunas.map((c, i) => {
          const entradas = soma(c.serie.entradas);
          const saidas = soma(c.serie.gastos);
          return (
            <div
              key={c.chave}
              className={`flex flex-col gap-3 ${i > 0 ? "border-t border-hairline pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                {c.cabecalho}
                <span className="type-caption text-ink-3">
                  saldo do período{" "}
                  <Amount cents={entradas - saidas} semantic="both" className="font-medium" />
                </span>
              </div>
              <TrendChart labels={labels} gastos={c.serie.gastos} entradas={c.serie.entradas} showLegend={false} height={150} yMax={yMax} />
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="type-caption text-ink-3">Entradas</dt>
                  <dd>
                    <Amount cents={entradas} semantic="none" className="text-[0.875rem] text-ink" />
                  </dd>
                </div>
                <div className="text-right">
                  <dt className="type-caption text-ink-3">Saídas</dt>
                  <dd>
                    <Amount cents={saidas} semantic="none" className="text-[0.875rem] text-ink" />
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
