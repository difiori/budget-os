import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import type { Conta } from "@/lib/domain/types";

/** Cor do saldo considerando cheque especial: positivo neutro, negativo dentro
 * do limite em âmbar, abaixo do limite em granada. */
function corSaldo(saldoCents: number, limiteCents: number): string {
  if (saldoCents >= 0) return "text-ink";
  if (saldoCents >= -limiteCents) return "text-warn";
  return "text-neg";
}

/** Resumo do saldo atual de cada conta bancária. */
export function SaldoPorConta({ contas }: { contas: Conta[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="type-title text-ink">Saldo por conta</h2>
        <p className="type-caption text-ink-3">saldo atual</p>
      </div>
      {contas.length === 0 ? (
        <p className="type-body py-4 text-center text-ink-2">Nenhuma conta cadastrada.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {contas.map((c) => {
            const limite = c.limite_cheque_especial_cents ?? 0;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[0.875rem] text-ink">{c.nome}</span>
                  <PersonTag pessoa={c.dono} />
                </span>
                <Amount
                  cents={c.saldo_atual_cents}
                  semantic="none"
                  className={`shrink-0 font-medium ${corSaldo(c.saldo_atual_cents, limite)}`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
