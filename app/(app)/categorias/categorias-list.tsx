"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import { inputClasses } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { SaidaList } from "@/components/saida/saida-list";
import { progressoPercent } from "@/lib/domain/orcamento";
import { variacao } from "@/lib/domain/fechamento";
import { formatCentsToBRL } from "@/lib/domain/money";
import { definirMetaCategoria } from "./actions";
import type { Categoria, CategoriaDono, Saida } from "@/lib/domain/types";

export interface CategoriaView {
  /** null representa o "balde" de saídas sem categoria atribuída. */
  categoria: Categoria | null;
  totalCents: number;
  /** Total da mesma categoria no mês anterior (base da variação). */
  totalAnteriorCents: number;
  saidas: Saida[];
}

/** "vs ago: +R$ 120 (+12%)" — gasto que sobe fica em granada, que cai em verde. */
function VariacaoMes({ atual, anterior, mesLabel }: { atual: number; anterior: number; mesLabel: string }) {
  if (anterior === 0 && atual === 0) return null;
  const v = variacao(atual, anterior);
  if (v.abs === 0) return <span className="type-caption text-ink-3">igual a {mesLabel}</span>;
  const cor = v.abs > 0 ? "text-neg" : "text-pos";
  const sinal = v.abs > 0 ? "+" : "−";
  return (
    <span className={`type-caption figures ${cor}`}>
      {sinal}
      {formatCentsToBRL(Math.abs(v.abs))}
      {v.pct !== null && ` (${sinal}${Math.round(Math.abs(v.pct))}%)`} vs {mesLabel}
    </span>
  );
}

/** Meta mensal editável no próprio card: sem meta vira um convite; com meta,
 * a barra de orçamento e um "editar" discreto. */
function MetaEditavel({
  categoria,
  realizadoCents,
  onMutou,
}: {
  categoria: Categoria;
  realizadoCents: number;
  onMutou: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(categoria.meta_mensal_cents ? (categoria.meta_mensal_cents / 100).toFixed(2).replace(".", ",") : "");
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  const meta = categoria.meta_mensal_cents;

  function salvar() {
    startTransition(async () => {
      const { error } = await definirMetaCategoria(categoria.id, valor);
      if (error) {
        toast(error);
        return;
      }
      setEditando(false);
      toast(valor.trim() ? `Meta de ${categoria.nome} salva.` : `Meta de ${categoria.nome} removida.`);
      onMutou();
    });
  }

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") setEditando(false);
          }}
          inputMode="decimal"
          placeholder="Meta mensal, ex.: 800,00"
          className={`figures ${inputClasses} max-w-[11rem] py-1.5`}
        />
        <button type="button" onClick={salvar} disabled={isPending} className="type-label rounded-sm bg-brand px-3 py-1.5 font-semibold text-on-brand disabled:opacity-40">
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={() => setEditando(false)} className="type-label px-2 py-1.5 text-ink-2 hover:text-ink">
          Cancelar
        </button>
        {meta !== null && (
          <button type="button" onClick={() => { setValor(""); }} className="type-caption ml-auto text-ink-3 underline underline-offset-2 hover:text-ink">
            limpar meta
          </button>
        )}
      </div>
    );
  }

  if (meta === null) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="type-caption flex items-center gap-1.5 self-start text-ink-3 transition-colors hover:text-ink"
      >
        <Target size={13} /> Definir meta mensal
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <OrcamentoBar realizadoCents={realizadoCents} metaCents={meta} />
      <button type="button" onClick={() => setEditando(true)} className="type-caption self-end text-ink-3 underline underline-offset-2 hover:text-ink">
        editar meta
      </button>
    </div>
  );
}

const DONO_TAG: Record<Exclude<CategoriaDono, "Diego" | "Vitor">, string> = {
  Ambos: "bg-hairline text-ink-2",
};

function DonoBadge({ dono }: { dono: CategoriaDono }) {
  if (dono === "Diego" || dono === "Vitor") return <PersonTag pessoa={dono} />;
  return (
    <span className={`type-caption inline-flex items-center rounded-xs px-1.5 py-0.5 font-medium ${DONO_TAG.Ambos}`}>
      {dono}
    </span>
  );
}

function OrcamentoBar({ realizadoCents, metaCents }: { realizadoCents: number; metaCents: number }) {
  const pct = progressoPercent(realizadoCents, metaCents);
  const estourou = realizadoCents > metaCents;
  const cor = estourou ? "bg-neg" : pct > 80 ? "bg-warn" : "bg-pos";
  return (
    <div className="flex flex-col gap-1.5">
      <ProgressBar percent={pct} colorClassName={cor} />
      <div className="flex items-baseline justify-between">
        <span className="type-caption text-ink-3">Meta {formatCentsToBRL(metaCents)}</span>
        {estourou ? (
          <span className="type-caption font-semibold text-neg">
            Excedeu em <span className="figures">{formatCentsToBRL(realizadoCents - metaCents)}</span>
          </span>
        ) : (
          <span className="type-caption text-ink-2">
            <span className="figures">{formatCentsToBRL(metaCents - realizadoCents)}</span> restantes
          </span>
        )}
      </div>
    </div>
  );
}

function CategoriaCard({
  view,
  categorias,
  origemLabelPorSaidaId,
  totalMes,
  mesAnteriorLabel,
}: {
  view: CategoriaView;
  categorias: Categoria[];
  origemLabelPorSaidaId: Record<string, string>;
  totalMes: number;
  mesAnteriorLabel: string;
}) {
  const router = useRouter();
  const onMutou = () => router.refresh();
  const [aberto, setAberto] = useState(false);

  const nome = view.categoria?.nome ?? "Sem categoria";
  const categoriaNomePorId = view.categoria ? { [view.categoria.id]: view.categoria.nome } : {};

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="type-title text-ink">{nome}</h2>
        {view.categoria && <DonoBadge dono={view.categoria.dono} />}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="type-caption text-ink-3">
          {view.saidas.length} saída{view.saidas.length === 1 ? "" : "s"} no mês
          {totalMes > 0 && view.totalCents > 0 && ` · ${Math.round((view.totalCents / totalMes) * 100)}% do total`}
        </span>
        <Amount cents={view.totalCents} semantic="none" className="type-title text-ink" />
      </div>
      <VariacaoMes atual={view.totalCents} anterior={view.totalAnteriorCents} mesLabel={mesAnteriorLabel} />

      {view.categoria && <MetaEditavel categoria={view.categoria} realizadoCents={view.totalCents} onMutou={onMutou} />}

      {view.saidas.length === 0 ? (
        <p className="type-caption text-ink-3">Nenhuma saída nesta categoria neste mês.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="flex w-full items-center justify-between text-ink-2 transition-colors hover:text-ink"
          >
            <span className="type-caption">
              {aberto ? "Ocultar" : "Ver"} saída{view.saidas.length === 1 ? "" : "s"}
            </span>
            <ChevronDown size={15} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
          </button>
          {aberto && (
            <SaidaList
              saidas={view.saidas}
              categorias={categorias}
              categoriaNomePorId={categoriaNomePorId}
              origemLabelPorSaidaId={origemLabelPorSaidaId}
              onMutou={onMutou}
            />
          )}
        </>
      )}
    </Card>
  );
}

export function CategoriasList({
  views,
  semMovimento,
  totalMes,
  mesAnteriorLabel,
  categorias,
  origemLabelPorSaidaId,
}: {
  views: CategoriaView[];
  /** Categorias sem saída neste mês nem no anterior — ficam recolhidas. */
  semMovimento: CategoriaView[];
  totalMes: number;
  mesAnteriorLabel: string;
  categorias: Categoria[];
  origemLabelPorSaidaId: Record<string, string>;
}) {
  const router = useRouter();
  const [mostrarParadas, setMostrarParadas] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="type-caption text-ink-3">Da maior para a menor · percentuais sobre o total do mês</p>
        <p className="type-label text-ink">
          Total <span className="figures">{formatCentsToBRL(totalMes)}</span>
        </p>
      </div>
      {views.length === 0 ? (
        <Card>
          <p className="type-body py-6 text-center text-ink-2">Nenhuma saída neste mês.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {views.map((view) => (
            <CategoriaCard
              key={view.categoria?.id ?? "sem-categoria"}
              view={view}
              categorias={categorias}
              origemLabelPorSaidaId={origemLabelPorSaidaId}
              totalMes={totalMes}
              mesAnteriorLabel={mesAnteriorLabel}
            />
          ))}
        </div>
      )}

      {semMovimento.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setMostrarParadas((v) => !v)}
            className="type-label self-start text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {mostrarParadas ? "Ocultar" : "Mostrar"} {semMovimento.length} categoria{semMovimento.length > 1 ? "s" : ""} sem
            movimento
          </button>
          {mostrarParadas && (
            <Card>
              <ul className="flex flex-col divide-y divide-hairline">
                {semMovimento.map((v) => (
                  <li key={v.categoria!.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[0.875rem] text-ink-2">{v.categoria!.nome}</span>
                      <DonoBadge dono={v.categoria!.dono} />
                    </span>
                    <div className="min-w-[14rem]">
                      <MetaEditavel categoria={v.categoria!} realizadoCents={0} onMutou={() => router.refresh()} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
