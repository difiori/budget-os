"use client";

import { useTransition } from "react";
import { definirContaAtiva } from "./account-switcher-actions";
import type { Pessoa } from "@/lib/domain/types";

const PESSOAS: Pessoa[] = ["Diego", "Vitor"];
const DOT: Record<Pessoa, string> = { Diego: "bg-diego", Vitor: "bg-vitor" };

export function AccountSwitcher({ contaAtiva }: { contaAtiva: Pessoa }) {
  const [isPending, startTransition] = useTransition();

  function trocar(pessoa: Pessoa) {
    if (pessoa === contaAtiva) return;
    startTransition(async () => {
      await definirContaAtiva(pessoa);
      window.location.reload();
    });
  }

  return (
    <div className="flex items-center gap-0.5 rounded-sm border border-hairline-strong bg-surface p-0.5">
      {PESSOAS.map((pessoa) => {
        const active = pessoa === contaAtiva;
        return (
          <button
            key={pessoa}
            type="button"
            disabled={isPending}
            onClick={() => trocar(pessoa)}
            aria-pressed={active}
            className={`type-label flex flex-1 items-center justify-center gap-1.5 rounded-xs px-3 py-1.5 transition-colors disabled:opacity-60 ${
              active ? "bg-chip-ink font-semibold text-on-chip-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${DOT[pessoa]}`} aria-hidden="true" />
            {pessoa}
          </button>
        );
      })}
    </div>
  );
}
