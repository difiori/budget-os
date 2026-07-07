"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { reconciliarSaldo } from "@/app/(app)/contas/actions";

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Reancora o saldo da conta para o valor real do banco. O saldo é mantido por
 * incrementos e pode derivar; isto fixa a âncora sem depender de recalcular
 * o histórico. */
export function AjustarSaldo({ contaId, saldoAtualCents }: { contaId: string; saldoAtualCents: number }) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(centsToInput(saldoAtualCents));
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function salvar() {
    startTransition(async () => {
      const { error } = await reconciliarSaldo(contaId, valor);
      if (error) {
        setErro(error);
        return;
      }
      setErro(null);
      setAberto(false);
      toast("Saldo reconciliado.");
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => {
          setValor(centsToInput(saldoAtualCents));
          setErro(null);
          setAberto(true);
        }}
        className="type-caption self-start text-ink-2 underline underline-offset-2 hover:text-ink"
      >
        Ajustar saldo
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3">
      <label className="type-caption text-ink-2">Saldo real no banco (reancora)</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          autoFocus
          className="figures w-32 rounded-sm border border-hairline-strong bg-raised px-3 py-1.5 text-ink outline-none focus:border-ink-2"
        />
        <Button variant="primary" onClick={salvar} disabled={isPending} className="px-3 py-1.5">
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)} disabled={isPending} className="px-3 py-1.5">
          Cancelar
        </Button>
      </div>
      {erro && <p className="type-caption text-neg">{erro}</p>}
    </div>
  );
}
