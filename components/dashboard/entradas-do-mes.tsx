"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonDot } from "@/components/ui/person-tag";
import { useToast } from "@/components/ui/toast";
import { useLancar } from "@/components/lancar/lancar-provider";
import { EditarEntradaForm } from "@/components/entrada/editar-entrada-form";
import { alternarStatusEntrada } from "@/app/(app)/lancamentos/actions";
import { formatCentsToBRL } from "@/lib/domain/money";
import type { Entrada, EntradaStatus, Pessoa } from "@/lib/domain/types";

function ddmm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/**
 * Entradas do mês da pessoa ativa, direto no Painel: ver, marcar recebido
 * (ou desfazer), editar inline e abrir uma nova — sem passar pelo filtro da
 * tela de Lançamentos. Total do mês no cabeçalho; "a receber" em destaque.
 */
export function EntradasDoMes({
  entradas,
  contas,
  pessoa,
  mesLabel,
}: {
  entradas: Entrada[];
  /** Contas da pessoa (para a edição e para o nome na linha). */
  contas: { id: string; nome: string }[];
  pessoa: Pessoa;
  mesLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { abrir } = useLancar();
  const [lista, setLista] = useState(entradas);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const contaNome = new Map(contas.map((c) => [c.id, c.nome]));

  const total = lista.reduce((s, e) => s + e.quantia_cents, 0);
  const aReceber = lista.filter((e) => e.status !== "Recebido").reduce((s, e) => s + e.quantia_cents, 0);

  function alternar(e: Entrada) {
    const novo: EntradaStatus = e.status === "Recebido" ? "Não recebido" : "Recebido";
    setLista((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: novo } : x)));
    startTransition(async () => {
      const { error } = await alternarStatusEntrada(e.id);
      if (error) {
        setLista((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: e.status } : x)));
        toast(error);
        return;
      }
      router.refresh();
    });
  }

  function novaEntrada() {
    abrir({
      tipo: "Entrada",
      nome: "",
      valor_cents: 0,
      metodo: null,
      destino_id: contas[0]?.id ?? null,
      de_conta_id: null,
      para_conta_id: null,
      categoria_id: null,
      data: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()),
      status: "Não recebido",
      parcelas: 1,
      conta_fixa: false,
      conta_fixa_existente: false,
      confianca: 1,
      duvidas: [],
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="type-title text-ink">Entradas do mês</h2>
          <button
            type="button"
            onClick={novaEntrada}
            className="type-caption inline-flex items-center gap-1 rounded-xs bg-brand-tint px-1.5 py-0.5 font-medium text-on-brand-tint transition-colors hover:brightness-95"
          >
            <Plus size={12} /> Nova
          </button>
        </div>
        {lista.length > 0 && (
          <p className="type-caption figures text-ink-3">
            {aReceber > 0 ? `${formatCentsToBRL(aReceber)} a receber · ` : ""}
            {formatCentsToBRL(total)}
          </p>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="type-body py-4 text-center text-ink-2">Nenhuma entrada em {mesLabel}.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {lista.map((e) => {
            const recebida = e.status === "Recebido";
            const aberta = editandoId === e.id;
            return (
              <li key={e.id} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <PersonDot pessoa={pessoa} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] text-ink">{e.nome}</p>
                    <p className="type-caption truncate text-ink-3">
                      {ddmm(e.data)} · {contaNome.get(e.conta_destino_id) ?? "—"}
                    </p>
                  </div>
                  <Amount cents={e.quantia_cents} semantic="none" className="shrink-0 text-[0.875rem] text-ink" />
                  <button
                    type="button"
                    onClick={() => alternar(e)}
                    aria-label={recebida ? "Marcar como a receber" : "Marcar como recebida"}
                    className={`type-caption min-w-[4.75rem] shrink-0 rounded-xs px-2 py-1 font-medium whitespace-nowrap transition-colors hover:brightness-95 ${
                      recebida ? "bg-brand-tint text-on-brand-tint" : "bg-warn-tint text-warn"
                    }`}
                  >
                    {recebida ? "Recebido" : "A receber"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoId(aberta ? null : e.id)}
                    aria-label={`Editar ${e.nome}`}
                    aria-expanded={aberta}
                    className={`shrink-0 rounded-sm p-1.5 transition-colors hover:bg-bg ${aberta ? "text-ink" : "text-ink-3 hover:text-ink"}`}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                {aberta && (
                  <div className="mt-2">
                    <EditarEntradaForm
                      entrada={e}
                      contas={contas}
                      onSalvo={(atualizada) => {
                        setLista((prev) => prev.map((x) => (x.id === atualizada.id ? atualizada : x)));
                        setEditandoId(null);
                        router.refresh();
                      }}
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
