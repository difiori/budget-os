"use client";

import { useState, useTransition } from "react";
import { CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonDot } from "@/components/ui/person-tag";
import { useToast } from "@/components/ui/toast";
import { alternarStatusSaida, marcarSaidasComoPagas } from "@/app/(app)/lancamentos/actions";
import { formatCentsToBRL } from "@/lib/domain/money";
import { nomeComParcela } from "@/lib/domain/parcelamento";
import type { Saida } from "@/lib/domain/types";

/** Fatura de um cartão no mês: total pendente + os ids das compras que a
 * compõem (pagas de uma vez ao quitar a fatura). */
export interface CartaoAPagar {
  cartaoId: string;
  nome: string;
  totalCents: number;
  ids: string[];
}

function formatVenc(iso: string | null): string {
  if (!iso) return "sem vencimento";
  const [, month, day] = iso.slice(0, 10).split("-");
  return `vence ${day}/${month}`;
}

/** Contas a pagar do mês: saídas em débito listadas uma a uma (marca pago pela
 * tag) e os cartões de crédito agregados numa linha só (nome + fatura do mês +
 * botão que quita a fatura inteira). */
export function ContasAPagar({
  debitos,
  destinoPorId,
  cartoes,
  totalCents,
}: {
  debitos: Saida[];
  destinoPorId: Record<string, string>;
  cartoes: CartaoAPagar[];
  totalCents: number;
}) {
  const [listaDeb, setListaDeb] = useState(debitos);
  const [listaCard, setListaCard] = useState(cartoes);
  const [, startTransition] = useTransition();
  const toast = useToast();

  const vazio = listaDeb.length === 0 && listaCard.length === 0;

  function pagarDebito(s: Saida) {
    setListaDeb((prev) => prev.filter((x) => x.id !== s.id));
    startTransition(async () => {
      const { error } = await alternarStatusSaida(s.id);
      if (error) {
        setListaDeb((prev) => [s, ...prev]);
        toast(error);
      }
    });
  }

  function pagarCartao(c: CartaoAPagar) {
    setListaCard((prev) => prev.filter((x) => x.cartaoId !== c.cartaoId));
    startTransition(async () => {
      const { error } = await marcarSaidasComoPagas(c.ids);
      if (error) {
        setListaCard((prev) => [c, ...prev]);
        toast(error);
      }
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-title text-ink">Contas a pagar</h2>
        {!vazio && <p className="type-caption figures text-ink-3">{formatCentsToBRL(totalCents)}</p>}
      </div>

      {vazio ? (
        <p className="type-body py-4 text-center text-ink-2">Nada a pagar por aqui. 🎉</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {listaCard.map((c) => (
            <li key={c.cartaoId} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs bg-track text-ink-2">
                <CreditCard size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] text-ink">{c.nome}</p>
                <p className="type-caption truncate text-ink-3">fatura do mês</p>
              </div>
              <Amount cents={c.totalCents} semantic="none" className="shrink-0 text-[0.875rem] text-ink" />
              <button
                type="button"
                onClick={() => pagarCartao(c)}
                aria-label={`Pagar fatura de ${c.nome}`}
                className="type-caption shrink-0 rounded-xs bg-brand-tint px-2 py-1 font-medium text-on-brand-tint transition-colors hover:brightness-95"
              >
                Pagar
              </button>
            </li>
          ))}

          {listaDeb.map((s) => (
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
                onClick={() => pagarDebito(s)}
                aria-label="Marcar como pago"
                className="type-caption shrink-0 rounded-xs bg-warn-tint px-2 py-1 font-medium text-warn transition-colors hover:brightness-95"
              >
                A pagar
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
