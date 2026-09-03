"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileSearch, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { atualizarSaida, excluirSaida } from "@/app/(app)/lancamentos/actions";
import { formatCentsToBRL } from "@/lib/domain/money";
import { nomeComParcela } from "@/lib/domain/parcelamento";
import { adicionarCompraDaFatura, conciliarFaturaIA, type ResultadoConciliacao, type SaidaDaFatura } from "./conciliar-actions";

function ddmm(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

/**
 * Conciliação da fatura fechada: sobe o PDF (ou foto), a IA extrai os itens,
 * o app casa com as compras daquela fatura e mostra o que falta, o que sobra e
 * o que diverge — cada linha com a ação que resolve.
 */
export function ConciliarFatura({
  cartaoId,
  cartaoNome,
  ano,
  mes,
  tituloFatura,
  iaDisponivel,
}: {
  cartaoId: string;
  cartaoNome: string;
  ano: number;
  mes: number;
  tituloFatura: string;
  iaDisponivel: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmar = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [lendo, startLer] = useTransition();
  const [, startAcao] = useTransition();
  const [resultado, setResultado] = useState<ResultadoConciliacao | null>(null);
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());

  if (!iaDisponivel) return null;

  function ler(arquivo: File) {
    const fd = new FormData();
    fd.set("arquivo", arquivo);
    fd.set("cartaoId", cartaoId);
    fd.set("ano", String(ano));
    fd.set("mes", String(mes));
    setResultado(null);
    setResolvidos(new Set());
    startLer(async () => {
      setResultado(await conciliarFaturaIA(fd));
    });
  }

  function marcar(chave: string) {
    setResolvidos((prev) => new Set(prev).add(chave));
  }

  function adicionar(item: { data: string; descricao: string; valor_cents: number; parcela: string | null }, chave: string) {
    startAcao(async () => {
      const { error } = await adicionarCompraDaFatura({
        cartaoId,
        nome: item.descricao,
        valorCents: item.valor_cents,
        data: item.data,
        parcela: item.parcela,
      });
      if (error) toast(error);
      else {
        marcar(chave);
        toast(`"${item.descricao}" adicionada como compra no ${cartaoNome}. Categorize em Lançamentos.`);
        router.refresh();
      }
    });
  }

  async function excluir(s: SaidaDaFatura, chave: string) {
    if (!(await confirmar(`Excluir "${s.nome}" (${formatCentsToBRL(s.total_cents)}) do app? Não está na fatura.`))) return;
    startAcao(async () => {
      const { error } = await excluirSaida({ id: s.id, status: s.status, totalCents: s.total_cents, metodo: "Crédito", contaId: null, cartaoId });
      if (error) toast(error);
      else {
        marcar(chave);
        toast(`"${s.nome}" excluída.`);
        router.refresh();
      }
    });
  }

  function usarValorDaFatura(s: SaidaDaFatura, valorCents: number, chave: string) {
    startAcao(async () => {
      const { error } = await atualizarSaida({
        id: s.id,
        nome: s.nome,
        totalCents: valorCents,
        data: s.data ?? "",
        vencimento: "",
        parcela: s.parcela,
        categoriaId: s.categoria_id,
        status: s.status,
        statusAnterior: s.status,
        totalCentsAnterior: s.total_cents,
        metodo: "Crédito",
        contaId: null,
        cartaoId,
      });
      if (error) toast(error);
      else {
        marcar(chave);
        toast(`"${s.nome}" ajustada para ${formatCentsToBRL(valorCents)}.`);
        router.refresh();
      }
    });
  }

  const linha = "flex items-center gap-3 py-2 first:pt-0 last:pb-0";

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="type-caption flex items-center gap-1.5 text-ink-2 transition-colors hover:text-ink"
        >
          <FileSearch size={14} /> Conciliar com a fatura do banco (PDF ou foto)
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-label text-ink">Conciliar {tituloFatura.toLowerCase()}</p>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-sm p-1 text-ink-3 hover:text-ink">
              <X size={15} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) ler(f);
              }}
              className="type-caption max-w-full text-ink-2 file:mr-3 file:rounded-sm file:border file:border-hairline-strong file:bg-surface file:px-3 file:py-1.5 file:text-ink"
              disabled={lendo}
            />
            {lendo && <span className="type-caption text-ink-3">Lendo a fatura com IA…</span>}
          </div>

          {resultado && !resultado.ok && <p className="type-caption text-neg">{resultado.error}</p>}

          {resultado?.ok && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 rounded-sm bg-bg p-3 sm:grid-cols-4">
                <div>
                  <p className="type-caption text-ink-3">Fatura do banco</p>
                  <Amount cents={resultado.fatura.total_cents ?? resultado.conciliacao.totalFatura} semantic="none" className="type-label text-ink" />
                </div>
                <div>
                  <p className="type-caption text-ink-3">No app</p>
                  <Amount cents={resultado.conciliacao.totalApp} semantic="none" className="type-label text-ink" />
                </div>
                <div>
                  <p className="type-caption text-ink-3">Conferidas</p>
                  <p className="type-label text-pos">{resultado.conciliacao.conferidas.length}</p>
                </div>
                <div>
                  <p className="type-caption text-ink-3">Pendências</p>
                  <p className="type-label text-ink">
                    {resultado.conciliacao.faltamNoApp.length + resultado.conciliacao.sobramNoApp.length + resultado.conciliacao.divergentes.length}
                  </p>
                </div>
              </div>
              {resultado.fatura.observacoes.length > 0 && (
                <p className="type-caption text-warn">{resultado.fatura.observacoes.join(" ")}</p>
              )}

              {resultado.conciliacao.faltamNoApp.length > 0 && (
                <section>
                  <p className="type-eyebrow mb-1.5 text-ink-3">Na fatura, mas não no app</p>
                  <ul className="divide-y divide-hairline">
                    {resultado.conciliacao.faltamNoApp.map((item, i) => {
                      const chave = `f-${i}`;
                      const feito = resolvidos.has(chave);
                      return (
                        <li key={chave} className={linha}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[0.875rem] text-ink">{item.parcela ? `${item.descricao} · ${item.parcela}` : item.descricao}</p>
                            <p className="type-caption text-ink-3">{ddmm(item.data)}</p>
                          </div>
                          <Amount cents={item.valor_cents} className="shrink-0 text-[0.875rem] text-ink" />
                          {feito ? (
                            <Check size={15} className="text-pos" />
                          ) : item.valor_cents < 0 ? (
                            <span className="type-caption shrink-0 text-ink-3">estorno</span>
                          ) : (
                            <Button variant="tonal" onClick={() => adicionar(item, chave)} className="px-2.5 py-1">
                              <Plus size={13} /> Adicionar
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {resultado.conciliacao.sobramNoApp.length > 0 && (
                <section>
                  <p className="type-eyebrow mb-1.5 text-ink-3">No app, mas não na fatura</p>
                  <ul className="divide-y divide-hairline">
                    {resultado.conciliacao.sobramNoApp.map((s) => {
                      const chave = `s-${s.id}`;
                      const feito = resolvidos.has(chave);
                      return (
                        <li key={chave} className={linha}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[0.875rem] text-ink">{nomeComParcela(s.nome, s.parcela)}</p>
                            <p className="type-caption text-ink-3">
                              {ddmm(s.data)} · {s.status} · pode ser duplicata ou compra que caiu em outra fatura
                            </p>
                          </div>
                          <Amount cents={s.total_cents} semantic="none" className="shrink-0 text-[0.875rem] text-ink" />
                          {feito ? (
                            <Check size={15} className="text-pos" />
                          ) : (
                            <Button variant="danger" onClick={() => excluir(s, chave)} className="px-2.5 py-1">
                              <Trash2 size={13} /> Excluir
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {resultado.conciliacao.divergentes.length > 0 && (
                <section>
                  <p className="type-eyebrow mb-1.5 text-ink-3">Valor diferente</p>
                  <ul className="divide-y divide-hairline">
                    {resultado.conciliacao.divergentes.map(({ item, saida, diferencaCents }) => {
                      const chave = `d-${saida.id}`;
                      const feito = resolvidos.has(chave);
                      return (
                        <li key={chave} className={linha}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[0.875rem] text-ink">{saida.nome}</p>
                            <p className="type-caption text-ink-3">
                              app {formatCentsToBRL(saida.total_cents)} · fatura {formatCentsToBRL(item.valor_cents)} ({diferencaCents > 0 ? "+" : "−"}
                              {formatCentsToBRL(Math.abs(diferencaCents))})
                            </p>
                          </div>
                          {feito ? (
                            <Check size={15} className="text-pos" />
                          ) : (
                            <Button variant="outline" onClick={() => usarValorDaFatura(saida, item.valor_cents, chave)} className="px-2.5 py-1">
                              Usar valor da fatura
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {resultado.conciliacao.conferidas.length > 0 && (
                <p className="type-caption text-ink-3">
                  {resultado.conciliacao.conferidas.length} compra{resultado.conciliacao.conferidas.length > 1 ? "s" : ""} conferida
                  {resultado.conciliacao.conferidas.length > 1 ? "s" : ""}: mesmo valor e data compatível nos dois lados.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
