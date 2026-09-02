"use client";

import { useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp } from "lucide-react";
import { useClickFora } from "./use-click-fora";

export interface OrdenacaoDe<T extends string> {
  campo: T;
  direcao: "asc" | "desc";
}

/**
 * Menu de ordenação único do app (Lançamentos, Últimas saídas): botão com o
 * campo ativo + seta da direção; a lista troca o campo (nasce desc) ou, no
 * campo já ativo, inverte a direção.
 */
export function SortMenu<T extends string>({
  opcoes,
  ordenacao,
  onOrdenar,
  size = "md",
}: {
  opcoes: { value: T; label: string }[];
  ordenacao: OrdenacaoDe<T>;
  onOrdenar: (o: OrdenacaoDe<T>) => void;
  /** md = altura dos inputs (barra de filtros); sm = altura dos chips (cards). */
  size?: "md" | "sm";
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useClickFora<HTMLDivElement>(aberto, () => setAberto(false));
  const label = opcoes.find((o) => o.value === ordenacao.campo)?.label ?? "Ordenar";
  const Direcao = ordenacao.direcao === "asc" ? ArrowUp : ArrowDown;
  const altura = size === "sm" ? "h-8 px-2.5" : "px-3 py-2.5";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        aria-label={`Ordenar por ${label}, ${ordenacao.direcao === "asc" ? "crescente" : "decrescente"}`}
        className={`type-label flex items-center gap-1.5 rounded-sm border border-hairline-strong bg-surface text-ink-2 transition-colors hover:border-ink-3 hover:text-ink ${altura}`}
      >
        <ArrowDownUp size={size === "sm" ? 13 : 15} />
        {label}
        <Direcao size={13} />
      </button>
      {aberto && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-sm border border-hairline bg-raised py-1 shadow-raised"
        >
          {opcoes.map((o) => {
            const ativo = ordenacao.campo === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={ativo}
                onClick={() =>
                  onOrdenar({
                    campo: o.value,
                    direcao: ativo ? (ordenacao.direcao === "asc" ? "desc" : "asc") : "desc",
                  })
                }
                className={`type-body flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-brand-tint ${
                  ativo ? "text-ink" : "text-ink-2"
                }`}
              >
                {o.label}
                {ativo && <Direcao size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
