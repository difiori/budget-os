"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Amount } from "@/components/ui/amount";
import { PersonDot } from "@/components/ui/person-tag";
import { parseCalendarDate } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";
import type { Categoria, Pessoa, Saida } from "@/lib/domain/types";

type Filtro = "Geral" | Pessoa;
type Ordenacao = "recentes" | "valor";

const FILTROS: Filtro[] = ["Geral", "Diego", "Vitor"];

function formatDataCurta(saida: Pick<Saida, "data" | "created_at">): string {
  const { day, month } = dataParaCalculo(saida);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

/** Recorrência gera ocorrências futuras junto com a atual — sem isso, uma
 * cobrança de dezembro aparece igual a uma de julho já paga na lista de
 * "últimas", como se já tivesse acontecido. */
function isFutura(saida: Saida, mesReferencia: { year: number; month: number }): boolean {
  const dataRelevante = saida.vencimento ? parseCalendarDate(saida.vencimento) : dataParaCalculo(saida);
  return (
    dataRelevante.year > mesReferencia.year ||
    (dataRelevante.year === mesReferencia.year && dataRelevante.month > mesReferencia.month)
  );
}

export function UltimasSaidas({
  saidas,
  categorias,
  mesReferencia,
}: {
  saidas: Saida[];
  categorias: Categoria[];
  mesReferencia: { year: number; month: number };
}) {
  const [filtro, setFiltro] = useState<Filtro>("Geral");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("recentes");

  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);

  const exibidas = useMemo(() => {
    const filtradas = filtro === "Geral" ? saidas : saidas.filter((s) => s.pessoa === filtro);
    const ordenadas =
      ordenacao === "valor" ? [...filtradas].sort((a, b) => b.total_cents - a.total_cents) : filtradas;
    return ordenadas.slice(0, 12);
  }, [saidas, filtro, ordenacao]);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Chip key={f} label={f} selected={filtro === f} onClick={() => setFiltro(f)} />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Mais recentes" selected={ordenacao === "recentes"} onClick={() => setOrdenacao("recentes")} />
          <Chip label="Maior valor" selected={ordenacao === "valor"} onClick={() => setOrdenacao("valor")} />
        </div>
      </div>

      {exibidas.length === 0 ? (
        <p className="type-body py-6 text-center text-ink-2">
          Nenhuma saída registrada ainda. Registre a primeira em Lançar.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {exibidas.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <PersonDot pessoa={s.pessoa} />
              <div className="min-w-0 flex-1">
                <p className="type-body truncate text-ink">
                  {s.nome}
                  {s.parcela ? ` · ${s.parcela}` : ""}
                </p>
                <p className="type-caption truncate text-ink-3">
                  {categoriaPorId.get(s.categoria_id ?? "") ?? "Sem categoria"} · {s.metodo}
                </p>
              </div>
              <div className="flex shrink-0 items-baseline gap-3">
                {isFutura(s, mesReferencia) && (
                  <span className="type-caption rounded-xs bg-warn-tint px-1.5 py-0.5 text-warn">agendada</span>
                )}
                <span className="type-caption figures w-10 text-right text-ink-3">{formatDataCurta(s)}</span>
                <Amount cents={s.total_cents} semantic="none" className="type-body w-24 text-right text-ink" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
