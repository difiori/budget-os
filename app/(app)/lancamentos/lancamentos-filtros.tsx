"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, ArrowDown, ArrowUp, ListChecks, Search, SlidersHorizontal, X } from "lucide-react";
import type { Pessoa } from "@/lib/domain/types";

export type TipoLanc = "Saida" | "Entrada" | "Transferencia";
export type StatusGrupo = "A pagar" | "Pago" | "A receber" | "Recebido";
export type Metodo = "Débito" | "Crédito";
export type CampoOrdenacao = "data" | "valor" | "nome" | "categoria";
export interface Ordenacao {
  campo: CampoOrdenacao;
  direcao: "asc" | "desc";
}

export interface Filtros {
  busca: string;
  pessoa: Pessoa | "Casal";
  tipos: TipoLanc[];
  metodos: Metodo[];
  status: StatusGrupo[];
  categorias: string[];
  contasCartoes: string[];
  origens: string[];
}

export interface ItemDescriptor {
  key: string;
  tipo: TipoLanc;
  pessoa: Pessoa;
  nome: string;
  categoriaId: string | null;
  categoriaNome: string;
  metodo: Metodo | null;
  contaCartaoIds: string[];
  origem: string | null;
  statusGrupo: StatusGrupo | null;
  dataSort: string;
  valorCents: number;
  node: React.ReactNode;
}

export function filtrosPadrao(pessoa: Pessoa): Filtros {
  return { busca: "", pessoa, tipos: [], metodos: [], status: [], categorias: [], contasCartoes: [], origens: [] };
}

/** Facetas que estreitam a lista (a busca e a pessoa ficam fora do contador). */
export function contarFiltros(f: Filtros): number {
  return (
    (f.tipos.length ? 1 : 0) +
    (f.metodos.length ? 1 : 0) +
    (f.status.length ? 1 : 0) +
    (f.categorias.length ? 1 : 0) +
    (f.contasCartoes.length ? 1 : 0) +
    (f.origens.length ? 1 : 0)
  );
}

export function passaFiltro(d: ItemDescriptor, f: Filtros): boolean {
  if (f.pessoa !== "Casal" && d.pessoa !== f.pessoa) return false;
  if (f.tipos.length && !f.tipos.includes(d.tipo)) return false;
  if (f.metodos.length && (d.metodo === null || !f.metodos.includes(d.metodo))) return false;
  if (f.status.length && (d.statusGrupo === null || !f.status.includes(d.statusGrupo))) return false;
  if (f.categorias.length && (d.categoriaId === null || !f.categorias.includes(d.categoriaId))) return false;
  if (f.contasCartoes.length && !d.contaCartaoIds.some((id) => f.contasCartoes.includes(id))) return false;
  if (f.origens.length && (d.origem === null || !f.origens.includes(d.origem))) return false;
  if (f.busca.trim()) {
    const q = f.busca.trim().toLowerCase();
    if (!d.nome.toLowerCase().includes(q) && !d.categoriaNome.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function ordenar(itens: ItemDescriptor[], o: Ordenacao): ItemDescriptor[] {
  const mult = o.direcao === "asc" ? 1 : -1;
  return [...itens].sort((a, b) => {
    if (o.campo === "valor") return (a.valorCents - b.valorCents) * mult;
    if (o.campo === "nome") return a.nome.localeCompare(b.nome, "pt-BR") * mult;
    if (o.campo === "categoria") return a.categoriaNome.localeCompare(b.categoriaNome, "pt-BR") * mult;
    return (a.dataSort < b.dataSort ? -1 : a.dataSort > b.dataSort ? 1 : 0) * mult;
  });
}

export interface Opcao {
  value: string;
  label: string;
  hint?: string;
}

const TIPOS: { value: TipoLanc; label: string }[] = [
  { value: "Saida", label: "Saídas" },
  { value: "Entrada", label: "Entradas" },
  { value: "Transferencia", label: "Transferências" },
];
const METODOS: Metodo[] = ["Débito", "Crédito"];
const STATUS: StatusGrupo[] = ["A pagar", "Pago", "A receber", "Recebido"];
const CAMPOS: { value: CampoOrdenacao; label: string }[] = [
  { value: "data", label: "Data" },
  { value: "valor", label: "Valor" },
  { value: "nome", label: "Nome" },
  { value: "categoria", label: "Categoria" },
];

/** Fecha ao clicar fora. */
function useClickFora<T extends HTMLElement>(aberto: boolean, fechar: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!aberto) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) fechar();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [aberto, fechar]);
  return ref;
}

function Segmento<T extends string>({
  valor,
  opcoes,
  onChange,
}: {
  valor: T;
  opcoes: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-sm border border-hairline-strong bg-surface p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`type-label rounded-xs px-2.5 py-1 transition-colors ${
            valor === o.value ? "bg-chip-ink text-on-chip-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Grupo de checkboxes-chip para seleção múltipla. */
function ChipsMulti<T extends string>({
  selecionados,
  opcoes,
  onToggle,
}: {
  selecionados: T[];
  opcoes: { value: T; label: string }[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => {
        const on = selecionados.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={`type-label rounded-full border px-3 py-1 transition-colors ${
              on
                ? "border-transparent bg-brand-tint text-on-brand-tint"
                : "border-hairline-strong text-ink-2 hover:border-ink-3"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Lista de opções com busca e caixas de seleção (categorias, contas/cartões). */
function ListaBusca({
  opcoes,
  selecionados,
  onToggle,
  placeholder,
}: {
  opcoes: Opcao[];
  selecionados: string[];
  onToggle: (v: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const filtradas = q.trim()
    ? opcoes.filter(
        (o) => o.label.toLowerCase().includes(q.toLowerCase()) || o.hint?.toLowerCase().includes(q.toLowerCase())
      )
    : opcoes;
  return (
    <div className="rounded-sm border border-hairline">
      <div className="border-b border-hairline p-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="type-body w-full rounded-xs bg-surface px-2.5 py-1.5 text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <div className="max-h-44 overflow-y-auto py-1">
        {filtradas.length === 0 && <p className="type-caption px-3 py-2 text-ink-3">Nada encontrado</p>}
        {filtradas.map((o) => {
          const on = selecionados.includes(o.value);
          return (
            <label
              key={o.value}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 hover:bg-brand-tint"
            >
              <span className="type-body flex min-w-0 items-center gap-2 text-ink">
                <input type="checkbox" checked={on} onChange={() => onToggle(o.value)} className="accent-brand" />
                <span className="truncate">{o.label}</span>
              </span>
              {o.hint && <span className="type-caption shrink-0 text-ink-3">{o.hint}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SecaoPainel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="type-eyebrow text-ink-3">{titulo}</p>
      {children}
    </div>
  );
}

export function FiltrosBar({
  filtros,
  onChange,
  ordenacao,
  onOrdenar,
  categorias,
  contasCartoes,
  pessoas,
  modoSelecao,
  onToggleSelecao,
  mostrarSelecao = false,
  totalVisivel,
}: {
  filtros: Filtros;
  onChange: (f: Filtros) => void;
  ordenacao: Ordenacao;
  onOrdenar: (o: Ordenacao) => void;
  categorias: Opcao[];
  contasCartoes: Opcao[];
  pessoas: { value: Pessoa | "Casal"; label: string }[];
  modoSelecao: boolean;
  onToggleSelecao: () => void;
  mostrarSelecao?: boolean;
  totalVisivel: number;
}) {
  const [painelAberto, setPainelAberto] = useState(false);
  const [ordAberto, setOrdAberto] = useState(false);
  const painelRef = useClickFora<HTMLDivElement>(painelAberto, () => setPainelAberto(false));
  const ordRef = useClickFora<HTMLDivElement>(ordAberto, () => setOrdAberto(false));

  const nCats = new Map(categorias.map((c) => [c.value, c.label]));
  const nContas = new Map(contasCartoes.map((c) => [c.value, c.label]));
  const nFiltros = contarFiltros(filtros);

  function toggle<T>(lista: T[], v: T): T[] {
    return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
  }

  const campoLabel = CAMPOS.find((c) => c.value === ordenacao.campo)?.label ?? "Data";

  // Chips de filtros ativos (cada valor removível individualmente).
  const chips: { id: string; label: string; remover: () => void }[] = [];
  filtros.tipos.forEach((t) =>
    chips.push({
      id: `tipo-${t}`,
      label: TIPOS.find((x) => x.value === t)?.label ?? t,
      remover: () => onChange({ ...filtros, tipos: filtros.tipos.filter((x) => x !== t) }),
    })
  );
  filtros.metodos.forEach((m) =>
    chips.push({ id: `met-${m}`, label: m, remover: () => onChange({ ...filtros, metodos: filtros.metodos.filter((x) => x !== m) }) })
  );
  filtros.status.forEach((s) =>
    chips.push({ id: `st-${s}`, label: s, remover: () => onChange({ ...filtros, status: filtros.status.filter((x) => x !== s) }) })
  );
  filtros.categorias.forEach((c) =>
    chips.push({
      id: `cat-${c}`,
      label: nCats.get(c) ?? "Categoria",
      remover: () => onChange({ ...filtros, categorias: filtros.categorias.filter((x) => x !== c) }),
    })
  );
  filtros.contasCartoes.forEach((c) =>
    chips.push({
      id: `cc-${c}`,
      label: nContas.get(c) ?? "Conta",
      remover: () => onChange({ ...filtros, contasCartoes: filtros.contasCartoes.filter((x) => x !== c) }),
    })
  );
  filtros.origens.forEach((o) =>
    chips.push({ id: `or-${o}`, label: o, remover: () => onChange({ ...filtros, origens: filtros.origens.filter((x) => x !== o) }) })
  );

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Busca */}
        <div className="relative min-w-[10rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={filtros.busca}
            onChange={(e) => onChange({ ...filtros, busca: e.target.value })}
            placeholder="Buscar por nome ou categoria"
            className="type-body w-full rounded-sm border border-hairline-strong bg-raised py-2.5 pl-9 pr-3 text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink-2"
          />
        </div>

        {/* Pessoa */}
        <Segmento
          valor={filtros.pessoa}
          opcoes={pessoas}
          onChange={(v) => onChange({ ...filtros, pessoa: v })}
        />

        {/* Ordenar */}
        <div ref={ordRef} className="relative">
          <button
            type="button"
            onClick={() => setOrdAberto((v) => !v)}
            aria-expanded={ordAberto}
            className="type-label flex items-center gap-1.5 rounded-sm border border-hairline-strong bg-surface px-3 py-2.5 text-ink-2 transition-colors hover:border-ink-3"
          >
            <ArrowDownUp size={15} />
            {campoLabel}
            {ordenacao.direcao === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          </button>
          {ordAberto && (
            <div className="absolute right-0 z-30 mt-1.5 w-44 overflow-hidden rounded-sm border border-hairline bg-raised py-1 shadow-raised">
              {CAMPOS.map((c) => {
                const ativo = ordenacao.campo === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() =>
                      onOrdenar({
                        campo: c.value,
                        direcao: ativo ? (ordenacao.direcao === "asc" ? "desc" : "asc") : "desc",
                      })
                    }
                    className={`type-body flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-brand-tint ${
                      ativo ? "text-ink" : "text-ink-2"
                    }`}
                  >
                    {c.label}
                    {ativo && (ordenacao.direcao === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Filtros */}
        <div ref={painelRef} className="relative">
          <button
            type="button"
            onClick={() => setPainelAberto((v) => !v)}
            aria-expanded={painelAberto}
            className={`type-label flex items-center gap-1.5 rounded-sm border px-3 py-2.5 transition-colors ${
              nFiltros > 0
                ? "border-transparent bg-brand-tint text-on-brand-tint"
                : "border-hairline-strong bg-surface text-ink-2 hover:border-ink-3"
            }`}
          >
            <SlidersHorizontal size={15} />
            Filtros
            {nFiltros > 0 && (
              <span className="figures rounded-full bg-brand px-1.5 text-[0.6875rem] font-semibold text-on-brand">
                {nFiltros}
              </span>
            )}
          </button>
          {painelAberto && (
            <div className="absolute right-0 z-30 mt-1.5 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-4 rounded-md border border-hairline bg-raised p-4 shadow-raised">
              <SecaoPainel titulo="Tipo">
                <ChipsMulti selecionados={filtros.tipos} opcoes={TIPOS} onToggle={(v) => onChange({ ...filtros, tipos: toggle(filtros.tipos, v) })} />
              </SecaoPainel>
              <SecaoPainel titulo="Método (saídas)">
                <ChipsMulti
                  selecionados={filtros.metodos}
                  opcoes={METODOS.map((m) => ({ value: m, label: m }))}
                  onToggle={(v) => onChange({ ...filtros, metodos: toggle(filtros.metodos, v) })}
                />
              </SecaoPainel>
              <SecaoPainel titulo="Status">
                <ChipsMulti
                  selecionados={filtros.status}
                  opcoes={STATUS.map((s) => ({ value: s, label: s }))}
                  onToggle={(v) => onChange({ ...filtros, status: toggle(filtros.status, v) })}
                />
              </SecaoPainel>
              <SecaoPainel titulo="Origem">
                <ChipsMulti
                  selecionados={filtros.origens}
                  opcoes={["Manual", "Recorrente", "Parcelamento"].map((o) => ({ value: o, label: o }))}
                  onToggle={(v) => onChange({ ...filtros, origens: toggle(filtros.origens, v) })}
                />
              </SecaoPainel>
              <SecaoPainel titulo="Categoria">
                <ListaBusca
                  opcoes={categorias}
                  selecionados={filtros.categorias}
                  onToggle={(v) => onChange({ ...filtros, categorias: toggle(filtros.categorias, v) })}
                  placeholder="Buscar categoria"
                />
              </SecaoPainel>
              <SecaoPainel titulo="Conta / Cartão">
                <ListaBusca
                  opcoes={contasCartoes}
                  selecionados={filtros.contasCartoes}
                  onToggle={(v) => onChange({ ...filtros, contasCartoes: toggle(filtros.contasCartoes, v) })}
                  placeholder="Buscar conta ou cartão"
                />
              </SecaoPainel>
              {nFiltros > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...filtros, tipos: [], metodos: [], status: [], categorias: [], contasCartoes: [], origens: [] })
                  }
                  className="type-label self-start text-ink-2 underline underline-offset-2 hover:text-ink"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* Selecionar (gestão em lote) */}
        {mostrarSelecao && (
          <button
            type="button"
            onClick={onToggleSelecao}
            aria-pressed={modoSelecao}
            className={`type-label flex items-center gap-1.5 rounded-sm border px-3 py-2.5 transition-colors ${
              modoSelecao
                ? "border-transparent bg-chip-ink text-on-chip-ink"
                : "border-hairline-strong bg-surface text-ink-2 hover:border-ink-3"
            }`}
          >
            <ListChecks size={15} />
            Selecionar
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="type-caption text-ink-3">{totalVisivel} no recorte ·</span>
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={c.remover}
              className="type-caption inline-flex items-center gap-1 rounded-full bg-brand-tint py-1 pl-2.5 pr-1.5 font-medium text-on-brand-tint transition-colors hover:brightness-95"
            >
              {c.label}
              <X size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
