"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, ExternalLink, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonDot } from "@/components/ui/person-tag";
import { FixaTag } from "@/components/ui/fixa-tag";
import { ParcelaTag } from "@/components/ui/parcela-tag";
import { useToast } from "@/components/ui/toast";
import { EditarSaidaForm } from "@/components/saida/editar-saida-form";
import { alternarStatusSaida, marcarSaidasComoPagas } from "@/app/(app)/lancamentos/actions";
import { formatCentsToBRL } from "@/lib/domain/money";
import { nomeSemParcela } from "@/lib/domain/parcelamento";
import type { Categoria, Saida } from "@/lib/domain/types";

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

/** Contas a pagar do mês: saídas em débito listadas uma a uma e os cartões de
 * crédito agregados numa linha só (nome + fatura do mês). Nos dois casos a
 * mesma tag "A pagar" em âmbar marca como pago — no cartão, quita a fatura
 * inteira. */
export function ContasAPagar({
  debitos,
  destinoPorId,
  cartoes,
  totalCents,
  fixaIds = [],
  categorias = [],
  cartoesHref = "/cartoes",
}: {
  debitos: Saida[];
  destinoPorId: Record<string, string>;
  cartoes: CartaoAPagar[];
  totalCents: number;
  /** Ids dos débitos que vêm de uma conta fixa (ganham o selo "fixa"). */
  fixaIds?: string[];
  /** Para a edição inline (categoria). */
  categorias?: Categoria[];
  /** Fatura se edita na tela de Cartões. */
  cartoesHref?: string;
}) {
  const fixas = new Set(fixaIds);
  const router = useRouter();
  const [listaDeb, setListaDeb] = useState(debitos);
  const [listaCard, setListaCard] = useState(cartoes);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();

  function aoEditar() {
    setEditandoId(null);
    router.refresh();
  }

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
                aria-label={`Marcar fatura de ${c.nome} como paga`}
                className="type-caption shrink-0 rounded-xs bg-warn-tint px-2 py-1 font-medium text-warn transition-colors hover:brightness-95"
              >
                A pagar
              </button>
              <Link
                href={cartoesHref}
                aria-label={`Abrir ${c.nome} em Cartões`}
                title="Compras da fatura em Cartões"
                className="shrink-0 rounded-sm p-1.5 text-ink-3 transition-colors hover:bg-bg hover:text-ink"
              >
                <ExternalLink size={14} />
              </Link>
            </li>
          ))}

          {listaDeb.map((s) => {
            const aberta = editandoId === s.id;
            return (
            <li key={s.id} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              {/* Mesma largura do ícone de cartão acima: os nomes alinham num eixo só. */}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                <PersonDot pessoa={s.pessoa} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-[0.875rem] text-ink">
                  <span className="truncate">{nomeSemParcela(s.nome, s.parcela)}</span>
                  <ParcelaTag parcela={s.parcela} />
                  {fixas.has(s.id) && <FixaTag />}
                </p>
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
              <button
                type="button"
                onClick={() => setEditandoId(aberta ? null : s.id)}
                aria-label={`Editar ${s.nome}`}
                aria-expanded={aberta}
                className={`shrink-0 rounded-sm p-1.5 transition-colors hover:bg-bg ${aberta ? "text-ink" : "text-ink-3 hover:text-ink"}`}
              >
                <Pencil size={14} />
              </button>
            </div>
            {aberta && (
              <div className="mt-2">
                <EditarSaidaForm
                  saida={s}
                  categorias={categorias}
                  destinoNome={destinoPorId[s.id] ?? "—"}
                  statusEditavel
                  onSalvo={aoEditar}
                  onExcluido={aoEditar}
                  onCancelar={() => setEditandoId(null)}
                />
              </div>
            )}
            </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
