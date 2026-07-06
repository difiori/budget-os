"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button } from "./button";

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<((message: string) => Promise<boolean>) | null>(null);

/** Substitui window.confirm() nativo por um diálogo com a identidade visual
 * do app — o nativo bloqueia a thread e não pode ser estilizado. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>.");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve });
    });
  }, []);

  function responder(valor: boolean) {
    state?.resolve(valor);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          role="presentation"
          onClick={() => responder(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim px-4"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirmação"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-md border border-hairline bg-surface p-5 shadow-raised"
          >
            <p className="type-body text-ink">{state.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => responder(false)} className="px-4 py-1.5">
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => responder(true)} className="px-4 py-1.5">
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
