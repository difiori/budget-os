"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { PersonDot } from "@/components/ui/person-tag";
import { useToast } from "@/components/ui/toast";
import { definirCategoriaEmLote } from "@/app/(app)/lancamentos/actions";
import { listarPendentesClassificacao, proporCategoriasIA, type PendenteClassificacao } from "@/app/(app)/categorias/ia-actions";
import { LOTE_IA, type Proposta } from "@/lib/ia/classificar-categorias";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import type { Categoria } from "@/lib/domain/types";
import type { Escopo } from "@/lib/domain/escopo";

interface Linha extends PendenteClassificacao {
  proposta: Proposta | null;
  escolhaId: string | null;
  selecionada: boolean;
}

interface Props {
  escopo: Escopo;
  inicioMes: string;
  fimMes: string;
  mesLabel: string;
  pendentesNoMes: number;
  pendentesNoTotal: number;
  categorias: Categoria[];
}

function ddmm(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : iso;
}

/**
 * Painel "Classificar com IA" da tela de Categorias: pega o que está em
 * Gastos Diversos ou sem categoria (do mês ou tudo), propõe categoria pelo
 * histórico e, para o resto, pela IA em lotes com progresso; a pessoa revisa
 * linha a linha (troca a categoria, desmarca) e aplica de uma vez pela ação
 * de lote que a tela de Lançamentos já usa.
 */
export function ClassificarIA({ escopo, inicioMes, fimMes, mesLabel, pendentesNoMes, pendentesNoTotal, categorias }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [fase, setFase] = useState<"inicio" | "carregando" | "revisao" | "aplicando">("inicio");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gdId, setGdId] = useState<string | null>(null);
  const [aplicadas, setAplicadas] = useState<number | null>(null);

  async function classificar(tudo: boolean) {
    setFase("carregando");
    setErro(null);
    setAplicadas(null);
    setProgresso(null);
    const r = await listarPendentesClassificacao(tudo ? { escopo } : { escopo, inicioMes, fimMes });
    if (!r.ok) {
      setErro(r.error);
      setFase("inicio");
      return;
    }
    setGdId(r.gastosDiversosId);
    const porId = new Map(r.propostasHistorico.map((p) => [p.id, p]));
    const base: Linha[] = r.itens.map((it) => {
      const p = porId.get(it.id) ?? null;
      return { ...it, proposta: p, escolhaId: p?.categoriaId ?? null, selecionada: !!p };
    });
    // IA em lotes, por pessoa, só para o que o histórico não resolveu.
    const restantes = base.filter((l) => !l.proposta);
    const lotes: Linha[][] = [];
    for (const pessoa of ["Diego", "Vitor"] as const) {
      const da = restantes.filter((l) => l.pessoa === pessoa);
      for (let i = 0; i < da.length; i += LOTE_IA) lotes.push(da.slice(i, i + LOTE_IA));
    }
    setLinhas(base);
    setProgresso({ feitos: 0, total: restantes.length });
    let atual = base;
    let feitos = 0;
    for (const lote of lotes) {
      const rr = await proporCategoriasIA(
        lote.map((l) => ({ id: l.id, nome: l.nome, pessoa: l.pessoa, valor_cents: l.valor_cents, metodo: l.metodo, destino: l.destino, data: l.data }))
      );
      if (!rr.ok) {
        setErro(rr.error);
        break;
      }
      const props = new Map(rr.propostas.map((p) => [p.id, p]));
      atual = atual.map((l) => {
        const p = props.get(l.id);
        if (!p) return l;
        return { ...l, proposta: p, escolhaId: p.categoriaId, selecionada: !!p.categoriaId && p.confianca >= 0.7 };
      });
      feitos += lote.length;
      setLinhas(atual);
      setProgresso({ feitos, total: restantes.length });
    }
    setFase("revisao");
  }

  function alternar(id: string) {
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, selecionada: !l.selecionada } : l)));
  }
  function escolher(id: string, categoriaId: string) {
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, escolhaId: categoriaId || null, selecionada: !!categoriaId } : l)));
  }
  function marcarTodas(valor: boolean) {
    setLinhas((ls) => ls.map((l) => ({ ...l, selecionada: valor && !!l.escolhaId })));
  }

  async function aplicar() {
    const alvo = linhas.filter((l) => l.selecionada && l.escolhaId && l.escolhaId !== l.categoriaAtualId);
    if (alvo.length === 0) return;
    setFase("aplicando");
    const porCategoria = new Map<string, string[]>();
    for (const l of alvo) porCategoria.set(l.escolhaId!, [...(porCategoria.get(l.escolhaId!) ?? []), l.id]);
    let ok = 0;
    let falha: string | null = null;
    for (const [categoriaId, ids] of porCategoria) {
      const r = await definirCategoriaEmLote(ids, categoriaId);
      if (r.error) falha = r.error;
      else ok += ids.length;
    }
    setAplicadas(ok);
    setFase("inicio");
    setLinhas([]);
    if (falha) setErro(falha);
    toast(ok === 1 ? "1 saída reclassificada." : `${ok} saídas reclassificadas.`);
    router.refresh();
  }

  const selecionadas = linhas.filter((l) => l.selecionada && l.escolhaId && l.escolhaId !== l.categoriaAtualId).length;
  const semProposta = linhas.filter((l) => !l.escolhaId).length;

  if (fase === "inicio") {
    if (pendentesNoTotal === 0 && aplicadas === null) return null;
    return (
      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="type-label flex items-center gap-2 text-ink">
              <Sparkles size={15} className="text-brand" /> Classificar com IA
            </p>
            <p className="type-caption mt-1 text-ink-2">
              {aplicadas !== null && aplicadas > 0 ? `${aplicadas} saídas reclassificadas. ` : ""}
              {pendentesNoTotal === 0
                ? "Nada em Gastos Diversos ou sem categoria."
                : `${pendentesNoMes} em Gastos Diversos ou sem categoria em ${mesLabel} · ${pendentesNoTotal} no total. O histórico resolve o que já tem padrão; a IA propõe o resto e você revisa antes de aplicar.`}
            </p>
          </div>
          {pendentesNoTotal > 0 && (
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {pendentesNoMes > 0 && (
                <Button type="button" variant="tonal" onClick={() => void classificar(false)} className="px-3 py-2">
                  Este mês ({pendentesNoMes})
                </Button>
              )}
              <Button type="button" variant={pendentesNoMes > 0 ? "outline" : "tonal"} onClick={() => void classificar(true)} className="px-3 py-2">
                Tudo ({pendentesNoTotal})
              </Button>
            </div>
          )}
        </div>
        {erro && <p className="type-caption text-neg">{erro}</p>}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="type-label flex items-center gap-2 text-ink">
          <Sparkles size={15} className="text-brand" /> Classificar com IA
        </p>
        {progresso && progresso.total > 0 && fase === "carregando" && (
          <p className="type-caption text-ink-2">
            IA: {progresso.feitos} de {progresso.total} saídas…
          </p>
        )}
        {fase !== "carregando" && (
          <p className="type-caption text-ink-2">
            {linhas.length} saídas · {selecionadas} marcadas{semProposta > 0 ? ` · ${semProposta} sem proposta` : ""}
          </p>
        )}
      </div>

      {linhas.length === 0 ? (
        <p className="type-body py-4 text-center text-ink-2">Buscando saídas…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => marcarTodas(true)} className="type-caption text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              marcar todas com proposta
            </button>
            <span className="type-caption text-ink-3">·</span>
            <button type="button" onClick={() => marcarTodas(false)} className="type-caption text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              desmarcar todas
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-hairline">
            <ul className="divide-y divide-hairline">
              {linhas.map((l) => {
                const opcoes = categoriasParaPessoa(categorias, l.pessoa).filter((c) => c.id !== gdId);
                const pct = l.proposta ? Math.round(l.proposta.confianca * 100) : 0;
                return (
                  <li
                    key={l.id}
                    className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto] ${l.selecionada ? "bg-brand-tint/40" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={l.selecionada}
                      disabled={!l.escolhaId || fase !== "revisao"}
                      onChange={() => alternar(l.id)}
                      aria-label={`Aplicar em ${l.nome}`}
                      className="h-4 w-4 accent-[var(--color-brand)]"
                    />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-[0.875rem] text-ink">
                        {escopo === "Casal" && <PersonDot pessoa={l.pessoa} />}
                        <span className="truncate">{l.nome}</span>
                      </p>
                      <p className="type-caption text-ink-3">
                        {ddmm(l.data)} · {l.metodo}
                        {l.destino ? ` · ${l.destino}` : ""}
                        {l.categoriaAtualId === null ? " · sem categoria" : ""}
                      </p>
                    </div>
                    <div className="col-span-3 flex items-center gap-2 sm:col-span-1">
                      <select
                        value={l.escolhaId ?? ""}
                        onChange={(e) => escolher(l.id, e.target.value)}
                        disabled={fase !== "revisao"}
                        aria-label={`Categoria para ${l.nome}`}
                        className="min-w-0 flex-1 rounded-sm border border-hairline-strong bg-surface px-2 py-1.5 text-[0.8125rem] text-ink"
                      >
                        <option value="">{l.proposta ? "Deixar como está" : "Sem proposta · escolha"}</option>
                        {opcoes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                      <span
                        className={`type-caption w-14 shrink-0 text-right ${
                          l.proposta?.origem === "ia" && pct < 70 ? "text-warn" : "text-ink-3"
                        }`}
                      >
                        {l.proposta?.origem === "historico" ? "histórico" : l.proposta?.origem === "ia" ? `IA ${pct}%` : fase === "carregando" ? "…" : "—"}
                      </span>
                    </div>
                    <Amount cents={l.valor_cents} className="shrink-0 text-[0.875rem] text-ink" />
                  </li>
                );
              })}
            </ul>
          </div>
          {erro && <p className="type-caption text-neg">{erro}</p>}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="button" onClick={() => void aplicar()} disabled={fase !== "revisao" || selecionadas === 0} className="flex-1 py-2.5">
              {fase === "aplicando" ? "Aplicando…" : selecionadas === 1 ? "Aplicar 1" : `Aplicar ${selecionadas}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFase("inicio");
                setLinhas([]);
              }}
              disabled={fase === "aplicando"}
              className="flex-1 py-2.5"
            >
              Cancelar
            </Button>
          </div>
          <p className="type-caption flex items-center gap-1.5 text-ink-3">
            <Check size={12} /> Aplica pela mesma ação de lote da tela de Lançamentos; nada muda sem você marcar.
          </p>
        </>
      )}
    </Card>
  );
}
