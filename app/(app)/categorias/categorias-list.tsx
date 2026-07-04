"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SaidaList } from "@/components/saida/saida-list";
import { progressoPercent } from "@/lib/domain/orcamento";
import { formatCentsToBRL } from "@/lib/domain/money";
import type { Categoria, CategoriaDono, Saida } from "@/lib/domain/types";

export interface CategoriaView {
  /** null representa o "balde" de saídas sem categoria atribuída. */
  categoria: Categoria | null;
  totalCents: number;
  saidas: Saida[];
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
}: {
  view: CategoriaView;
  categorias: Categoria[];
  origemLabelPorSaidaId: Record<string, string>;
}) {
  const router = useRouter();
  const onMutou = () => router.refresh();
  const [aberto, setAberto] = useState(false);

  const nome = view.categoria?.nome ?? "Sem categoria";
  const categoriaNomePorId = view.categoria ? { [view.categoria.id]: view.categoria.nome } : {};
  const metaMensalCents = view.categoria?.meta_mensal_cents ?? null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="type-title text-ink">{nome}</h2>
        {view.categoria && <DonoBadge dono={view.categoria.dono} />}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="type-caption text-ink-3">
          {view.saidas.length} saída{view.saidas.length === 1 ? "" : "s"} no mês
        </span>
        <Amount cents={view.totalCents} semantic="none" className="type-title text-ink" />
      </div>

      {metaMensalCents !== null && <OrcamentoBar realizadoCents={view.totalCents} metaCents={metaMensalCents} />}

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
  categorias,
  origemLabelPorSaidaId,
}: {
  views: CategoriaView[];
  categorias: Categoria[];
  origemLabelPorSaidaId: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {views.map((view) => (
        <CategoriaCard
          key={view.categoria?.id ?? "sem-categoria"}
          view={view}
          categorias={categorias}
          origemLabelPorSaidaId={origemLabelPorSaidaId}
        />
      ))}
    </div>
  );
}
