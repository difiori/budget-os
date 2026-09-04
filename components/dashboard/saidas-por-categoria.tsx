import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatCentsToBRL } from "@/lib/domain/money";
import type { Pessoa } from "@/lib/domain/types";

export interface LinhaCategoria {
  id: string;
  nome: string;
  total: number;
}

/**
 * Saídas por categoria da PESSOA ativa no mês (por vencimento, regra 4).
 * Segue o "Vendo como" do Painel — um card do casal aqui, ao lado do saldo e
 * das contas a pagar da pessoa, misturava escopos e fazia o aporte de um
 * aparecer na leitura do outro. O percentual é sobre o total do mês da
 * pessoa. Ao lado de Contas a pagar, que é alto, o card é elástico: mostra
 * todas as categorias com movimento (sem "Outras"), em linhas compactas; um
 * `maxLinhas` opcional volta a agrupar o excedente em "Outras". Saída sem
 * categoria aparece nomeada.
 */
export function SaidasPorCategoria({
  pessoa,
  mesLabel,
  linhas,
  semCategoria,
  maxLinhas = Infinity,
}: {
  pessoa: Pessoa;
  mesLabel: string;
  /** Já ordenadas da maior para a menor. */
  linhas: LinhaCategoria[];
  /** Total de saídas do mês sem categoria (0 = nada a mostrar). */
  semCategoria: number;
  maxLinhas?: number;
}) {
  const total = linhas.reduce((sum, l) => sum + l.total, 0) + semCategoria;
  const principais = Number.isFinite(maxLinhas) ? linhas.slice(0, maxLinhas) : linhas;
  const demais = Number.isFinite(maxLinhas) ? linhas.slice(maxLinhas) : [];
  const outras = demais.reduce((sum, l) => sum + l.total, 0);
  const exibidas: LinhaCategoria[] = [
    ...principais,
    ...(outras > 0 ? [{ id: "__outras", nome: `Outras (${demais.length})`, total: outras }] : []),
    ...(semCategoria > 0 ? [{ id: "__sem", nome: "Sem categoria", total: semCategoria }] : []),
  ];
  const maior = Math.max(1, ...exibidas.map((l) => l.total));
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <Card className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-3">
          <p className="type-title text-ink">Saídas por categoria</p>
          <PersonTag pessoa={pessoa} />
        </div>
        <p className="type-caption text-ink-3">{mesLabel} · por vencimento</p>
      </div>

      {exibidas.length === 0 ? (
        <p className="type-body py-4 text-center text-ink-2">Sem saídas neste mês.</p>
      ) : (
        <>
          {exibidas.map((l) => (
            <div key={l.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`truncate text-[0.875rem] ${l.id.startsWith("__") ? "text-ink-2" : "text-ink"}`}>
                  {l.nome}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="type-caption figures text-ink-3">{pct(l.total)}%</span>
                  <Amount cents={l.total} semantic="none" className="text-[0.875rem] text-ink-2" />
                </span>
              </div>
              <ProgressBar
                percent={(l.total / maior) * 100}
                heightClassName="h-1"
                colorClassName={l.id.startsWith("__") ? "bg-hairline-strong" : "bg-ink-2"}
              />
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2.5">
            <span className="type-caption text-ink-3">Total do mês</span>
            <span className="figures text-[0.875rem] font-medium text-ink">{formatCentsToBRL(total)}</span>
          </div>
        </>
      )}
    </Card>
  );
}
