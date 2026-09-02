import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import type { CalendarDate } from "@/lib/domain/calendar-date";
import { MESES_ABREV } from "@/lib/format/meses";

/**
 * Projeção de saldo mês a mês para Diego, Vitor e o casal na mesma tela. No
 * desktop (xl) os meses correm em colunas e as pessoas em linhas, com o rótulo
 * numa coluna fixa pra os valores alinharem; abaixo disso a tabela é
 * transposta (meses em linhas, três colunas de valor) — cabe no celular sem
 * rolagem horizontal.
 */
export function Projecao({
  meses,
  diego,
  vitor,
  casal,
}: {
  meses: CalendarDate[];
  diego: number[];
  vitor: number[];
  casal: number[];
}) {
  const rotulo = (m: CalendarDate) => `${MESES_ABREV[m.month - 1]}/${String(m.year).slice(2)}`;
  const linhas: { chave: string; cabecalho: React.ReactNode; valores: number[]; total?: boolean }[] = [
    { chave: "Diego", cabecalho: <PersonTag pessoa="Diego" />, valores: diego },
    { chave: "Vitor", cabecalho: <PersonTag pessoa="Vitor" />, valores: vitor },
    { chave: "Casal", cabecalho: <span className="type-label text-ink">Casal</span>, valores: casal, total: true },
  ];

  return (
    <Card>
      {/* xl+: pessoas em linhas, meses em colunas. */}
      <div className="hidden xl:grid xl:grid-cols-[4.5rem_repeat(6,minmax(0,1fr))] xl:items-baseline xl:gap-x-4 xl:gap-y-3">
        <span aria-hidden="true" />
        {meses.map((m, i) => (
          <span key={i} className="type-eyebrow text-right text-ink-3">
            {rotulo(m)}
          </span>
        ))}
        {linhas.map((linha) => (
          <div key={linha.chave} className={`contents ${linha.total ? "[&>*]:border-t [&>*]:border-hairline [&>*]:pt-3" : ""}`}>
            <div>{linha.cabecalho}</div>
            {linha.valores.map((v, i) => (
              <Amount
                key={i}
                cents={v}
                semantic={linha.total ? "both" : "neg"}
                className={`block text-right text-[0.875rem] ${linha.total ? "font-medium text-ink" : "text-ink-2"}`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Abaixo de xl: meses em linhas, três colunas de valor. */}
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,auto)] items-baseline gap-x-3 gap-y-2.5 xl:hidden">
        <span aria-hidden="true" />
        <div className="justify-self-end">
          <PersonTag pessoa="Diego" />
        </div>
        <div className="justify-self-end">
          <PersonTag pessoa="Vitor" />
        </div>
        <span className="type-label justify-self-end text-ink">Casal</span>
        {meses.map((m, i) => (
          <div key={i} className="contents">
            <span className="type-caption text-ink-3">{rotulo(m)}</span>
            <Amount cents={diego[i]} className="text-right text-[0.8125rem] text-ink-2" />
            <Amount cents={vitor[i]} className="text-right text-[0.8125rem] text-ink-2" />
            <Amount cents={casal[i]} semantic="both" className="text-right text-[0.8125rem] font-medium text-ink" />
          </div>
        ))}
      </div>
    </Card>
  );
}
