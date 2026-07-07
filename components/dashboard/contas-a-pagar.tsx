"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonDot } from "@/components/ui/person-tag";
import { useToast } from "@/components/ui/toast";
import { alternarStatusSaida } from "@/app/(app)/lancamentos/actions";
import { formatCentsToBRL } from "@/lib/domain/money";
import { nomeComParcela } from "@/lib/domain/parcelamento";
import type { Saida } from "@/lib/domain/types";

function formatVenc(iso: string | null): string {
  if (!iso) return "sem vencimento";
  const [, month, day] = iso.slice(0, 10).split("-");
  return `vence ${day}/${month}`;
}

/** Card do Painel com as saídas ainda a pagar, com botão pra marcar como pago
 * ali mesmo (otimista) sem abrir a edição. */
export function ContasAPagar({
  saidas,
  destinoPorId,
  totalCents,
  restante,
}: {
  saidas: Saida[];
  destinoPorId: Record<string, string>;
  totalCents: number;
  restante: number;
}) {
  const [lista, setLista] = useState(saidas);
  const [, startTransition] = useTransition();
  const toast = useToast();

  function marcarPago(saida: Saida) {
    setLista((prev) => prev.filter((s) => s.id !== saida.id));
    startTransition(async () => {
      const { error } = await alternarStatusSaida(saida.id);
      if (error) {
        setLista((prev) => [saida, ...prev]);
        toast(error);
      }
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-title text-ink">Contas a pagar</h2>
        {lista.length > 0 && (
          <p className="type-caption figures text-ink-3">{formatCentsToBRL(totalCents)}</p>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="type-body py-4 text-center text-ink-2">Nada a pagar por aqui. 🎉</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {lista.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <PersonDot pessoa={s.pessoa} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] text-ink">{nomeComParcela(s.nome, s.parcela)}</p>
                <p className="type-caption truncate text-ink-3">
                  {formatVenc(s.vencimento)} · {destinoPorId[s.id] ?? "—"}
                </p>
              </div>
              <Amount cents={s.total_cents} semantic="none" className="shrink-0 text-[0.875rem] text-ink" />
              <button
                type="button"
                onClick={() => marcarPago(s)}
                aria-label="Marcar como pago"
                className="type-caption shrink-0 rounded-xs bg-warn-tint px-2 py-1 font-medium text-warn transition-colors hover:brightness-95"
              >
                A pagar
              </button>
            </li>
          ))}
        </ul>
      )}

      {restante > 0 && lista.length > 0 && (
        <p className="type-caption text-ink-3">e mais {restante} a pagar</p>
      )}
    </Card>
  );
}
