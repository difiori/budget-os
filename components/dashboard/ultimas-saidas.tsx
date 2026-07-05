"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Amount } from "@/components/ui/amount";
import { PersonDot } from "@/components/ui/person-tag";
import { EditarSaidaForm } from "@/components/saida/editar-saida-form";
import { parseCalendarDate } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";
import { nomeComParcela } from "@/lib/domain/parcelamento";
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

/** Selo de status: pago em verde-tinta, a pagar em âmbar-tinta. */
function StatusTag({ status }: { status: Saida["status"] }) {
  const pago = status === "Pago";
  return (
    <span
      className={`type-caption rounded-xs px-1.5 py-0.5 font-medium ${
        pago ? "bg-brand-tint text-on-brand-tint" : "bg-warn-tint text-warn"
      }`}
    >
      {status}
    </span>
  );
}

export function UltimasSaidas({
  saidas,
  categorias,
  contaPorId,
  cartaoPorId,
  mesReferencia,
}: {
  saidas: Saida[];
  categorias: Categoria[];
  contaPorId: Map<string, string>;
  cartaoPorId: Map<string, string>;
  mesReferencia: { year: number; month: number };
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("Geral");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("recentes");
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);

  function destino(s: Saida): string {
    const id = s.metodo === "Débito" ? s.conta_id : s.cartao_id;
    return (id && (s.metodo === "Débito" ? contaPorId.get(id) : cartaoPorId.get(id))) ?? "—";
  }

  const exibidas = useMemo(() => {
    const filtradas = filtro === "Geral" ? saidas : saidas.filter((s) => s.pessoa === filtro);
    const ordenadas =
      ordenacao === "valor" ? [...filtradas].sort((a, b) => b.total_cents - a.total_cents) : filtradas;
    return ordenadas.slice(0, 12);
  }, [saidas, filtro, ordenacao]);

  function aoMudar() {
    setAbertaId(null);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Chip key={f} label={f} selected={filtro === f} onClick={() => setFiltro(f)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip label="Por vencimento" selected={ordenacao === "recentes"} onClick={() => setOrdenacao("recentes")} />
          <Chip label="Maior valor" selected={ordenacao === "valor"} onClick={() => setOrdenacao("valor")} />
          <Link
            href={`/lancamentos?ano=${mesReferencia.year}&mes=${mesReferencia.month}`}
            className="type-caption ml-1 flex items-center gap-1 text-ink-2 hover:text-ink"
          >
            Ver tudo <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {exibidas.length === 0 ? (
        <p className="type-body py-6 text-center text-ink-2">
          Nenhuma saída registrada ainda. Registre a primeira em Lançar.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {exibidas.map((s) => {
            const aberta = abertaId === s.id;
            return (
              <li key={s.id} className="py-1.5 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => setAbertaId(aberta ? null : s.id)}
                  aria-expanded={aberta}
                  className="flex w-full items-center gap-3 rounded-sm py-1.5 text-left transition-colors hover:bg-bg"
                >
                  <PersonDot pessoa={s.pessoa} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] text-ink">{nomeComParcela(s.nome, s.parcela)}</p>
                    <p className="type-caption truncate text-ink-3">
                      {categoriaPorId.get(s.categoria_id ?? "") ?? "Sem categoria"} · {s.metodo} · {destino(s)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    {isFutura(s, mesReferencia) ? (
                      <span className="type-caption hidden rounded-xs bg-warn-tint px-1.5 py-0.5 text-warn sm:inline">
                        agendada
                      </span>
                    ) : (
                      <span className="hidden sm:inline">
                        <StatusTag status={s.status} />
                      </span>
                    )}
                    <span className="type-caption figures w-9 text-right text-ink-3">{formatDataCurta(s)}</span>
                    <Amount cents={s.total_cents} semantic="none" className="w-24 text-right text-[0.875rem] text-ink" />
                    <ChevronDown
                      size={15}
                      className={`text-ink-3 transition-transform ${aberta ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>
                {aberta && (
                  <div className="pb-2 pt-1">
                    <EditarSaidaForm
                      saida={s}
                      categorias={categorias}
                      destinoNome={destino(s)}
                      onSalvo={aoMudar}
                      onExcluido={aoMudar}
                      onCancelar={() => setAbertaId(null)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
