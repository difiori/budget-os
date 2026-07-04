"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

export interface ComboOption {
  value: string;
  label: string;
  /** Rótulo secundário à direita (ex.: dono da categoria). */
  hint?: string;
}

/**
 * Single-select pesquisável. Substitui os paredões de chips: mostra o rótulo
 * selecionado num gatilho compacto e abre uma lista filtrável ao digitar.
 * Teclado: setas navegam, Enter escolhe, Esc fecha; clicar fora fecha.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Selecionar",
  searchPlaceholder = "Buscar…",
  clearable = false,
  emptyLabel = "Nada encontrado",
  id,
  className = "",
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  clearable?: boolean;
  emptyLabel?: string;
  id?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const raizRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const listaId = useId();

  const selecionada = options.find((o) => o.value === value) ?? null;

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  }, [options, busca]);

  useEffect(() => {
    if (!aberto) return;
    buscaRef.current?.focus();
    setAtivo(0);
    function onDocClick(e: MouseEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [aberto]);

  function escolher(v: string) {
    onChange(v);
    setAberto(false);
    setBusca("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => Math.min(i + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const op = filtradas[ativo];
      if (op) escolher(op.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
    }
  }

  return (
    <div ref={raizRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-2 rounded-sm border border-hairline-strong bg-raised px-3.5 py-2.5 text-left text-ink outline-none transition-colors hover:border-ink-3 focus:border-ink-2"
      >
        <span className={`type-body truncate ${selecionada ? "text-ink" : "text-ink-3"}`}>
          {selecionada ? selecionada.label : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {clearable && selecionada && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="rounded-xs p-0.5 text-ink-3 hover:text-ink"
            >
              <X size={14} />
            </span>
          )}
          <ChevronsUpDown size={15} className="text-ink-3" />
        </span>
      </button>

      {aberto && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-sm border border-hairline bg-raised shadow-raised">
          <div className="border-b border-hairline p-2">
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setAtivo(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="type-body w-full rounded-xs bg-surface px-2.5 py-1.5 text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <ul role="listbox" id={listaId} className="max-h-60 overflow-y-auto py-1">
            {filtradas.length === 0 && <li className="type-caption px-3 py-2 text-ink-3">{emptyLabel}</li>}
            {filtradas.map((op, i) => {
              const sel = op.value === value;
              return (
                <li key={op.value} role="option" aria-selected={sel}>
                  <button
                    type="button"
                    onClick={() => escolher(op.value)}
                    onMouseEnter={() => setAtivo(i)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                      i === ativo ? "bg-brand-tint text-on-brand-tint" : "text-ink"
                    }`}
                  >
                    <span className="type-body flex min-w-0 items-center gap-2">
                      <Check size={14} className={sel ? "text-brand" : "text-transparent"} />
                      <span className="truncate">{op.label}</span>
                    </span>
                    {op.hint && <span className="type-caption shrink-0 text-ink-3">{op.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
