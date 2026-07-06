"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { LancarForm } from "@/app/(app)/lancar/lancar-form";
import type { Cartao, Categoria, Conta, Pessoa } from "@/lib/domain/types";

interface LancarCtx {
  abrir: () => void;
  /** Se o overlay de Lançar está aberto — a calculadora usa pra sair da
   * frente do botão "Salvar" no mobile. */
  aberto: boolean;
}

const Ctx = createContext<LancarCtx | null>(null);

/** Abre o formulário de lançamento (overlay global) de qualquer tela. */
export function useLancar() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLancar precisa estar dentro de <LancarProvider>.");
  return ctx;
}

/**
 * Torna "Lançar" onipresente: guarda os dados do formulário (contas, cartões,
 * categorias) buscados uma vez no layout e abre o form num overlay — bottom
 * sheet no mobile, modal centralizado no desktop. Como o form reseta a cada
 * sucesso, dá pra lançar vários seguidos; ao fechar, atualiza a página de fundo.
 */
export function LancarProvider({
  contas,
  cartoes,
  categorias,
  pessoaAtiva,
  children,
}: {
  contas: Conta[];
  cartoes: Cartao[];
  categorias: Categoria[];
  pessoaAtiva: Pessoa;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();

  function fechar() {
    setAberto(false);
    router.refresh();
  }

  return (
    <Ctx.Provider value={{ abrir: () => setAberto(true), aberto }}>
      {children}
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-scrim" onClick={fechar} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Novo lançamento"
            className="glass glass-modal relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg sm:max-h-[90vh] sm:max-w-4xl sm:rounded-lg"
          >
            <div className="flex items-center justify-between border-b border-hairline bg-surface px-5 py-3.5">
              <p className="type-title text-ink">Novo lançamento</p>
              <button
                type="button"
                onClick={fechar}
                aria-label="Fechar"
                className="rounded-sm p-1.5 text-ink-2 transition-colors hover:bg-bg hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            >
              <LancarForm contas={contas} cartoes={cartoes} categorias={categorias} pessoaAtiva={pessoaAtiva} />
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
