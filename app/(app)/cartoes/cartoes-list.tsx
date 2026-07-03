"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import { PersonTag } from "@/components/ui/person-tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import { atualizarSaida, excluirSaida } from "../lancamentos/actions";
import type { Cartao, Categoria, Saida, SaidaStatus } from "@/lib/domain/types";

const STATUS_SAIDA: SaidaStatus[] = ["A pagar", "Pago"];

export interface CartaoView {
  cartao: Cartao;
  faturaAtual: number;
  comprometido: number;
  disponivel: number | null;
  contaVinculadaNome: string | null;
  compras: Saida[];
  parcelasFuturas: { id: string; nomeBase: string; parcela: string | null; totalCents: number }[];
  categoriaNomePorId: Record<string, string>;
}

function isoParaInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}
function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
function formatDataCurta(iso: string | null): string {
  if (!iso) return "—";
  const [, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}`;
}

function LimiteBar({ comprometido, limite }: { comprometido: number; limite: number }) {
  const disponivel = limite - comprometido;
  const pct = (comprometido / limite) * 100;
  const estourado = disponivel < 0;
  const cor = estourado ? "bg-neg" : pct > 80 ? "bg-warn" : "bg-pos";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="type-caption text-ink-3">Limite {formatCentsToBRL(limite)}</span>
        {estourado ? (
          <span className="type-label font-semibold text-neg">
            Excedido em <span className="figures">{formatCentsToBRL(-disponivel)}</span>
          </span>
        ) : (
          <span className="type-caption text-ink-2">
            <span className="figures">{formatCentsToBRL(disponivel)}</span> disponíveis
          </span>
        )}
      </div>
      <ProgressBar percent={pct} colorClassName={cor} />
    </div>
  );
}

function CompraRow({
  saida,
  categorias,
  categoriaNome,
  onMutou,
}: {
  saida: Saida;
  categorias: Categoria[];
  categoriaNome: string;
  onMutou: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(saida.nome);
  const [valor, setValor] = useState(centsToInputValue(saida.total_cents));
  const [data, setData] = useState(isoParaInput(saida.data));
  const [vencimento, setVencimento] = useState(isoParaInput(saida.vencimento));
  const [categoriaId, setCategoriaId] = useState(saida.categoria_id ?? "");
  const [status, setStatus] = useState<SaidaStatus>(saida.status);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categoriasFiltradas = categoriasParaPessoa(categorias, saida.pessoa);

  function salvar() {
    let totalCents: number;
    try {
      totalCents = parseCentsFromBRL(valor);
    } catch {
      setErro("Valor inválido.");
      return;
    }
    startTransition(async () => {
      const { error } = await atualizarSaida({
        id: saida.id,
        nome,
        totalCents,
        data,
        vencimento,
        parcela: saida.parcela,
        categoriaId: categoriaId || null,
        status,
        statusAnterior: saida.status,
        totalCentsAnterior: saida.total_cents,
        metodo: saida.metodo,
        contaId: saida.conta_id,
        cartaoId: saida.cartao_id,
      });
      if (error) {
        setErro(error);
        return;
      }
      setEditando(false);
      onMutou();
    });
  }

  function remover() {
    if (!confirm(`Excluir "${saida.nome}"?`)) return;
    startTransition(async () => {
      const { error } = await excluirSaida({
        id: saida.id,
        status: saida.status,
        totalCents: saida.total_cents,
        metodo: saida.metodo,
        contaId: saida.conta_id,
        cartaoId: saida.cartao_id,
      });
      if (error) {
        setErro(error);
        return;
      }
      onMutou();
    });
  }

  if (editando) {
    return (
      <div className="rounded-sm bg-bg px-3 py-3">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="type-caption mb-1 block text-ink-2">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClasses} />
          </div>
          <div>
            <label className="type-caption mb-1 block text-ink-2">Valor</label>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              className={`figures ${inputClasses}`}
            />
          </div>
          <div>
            <label className="type-caption mb-1 block text-ink-2">Data da compra</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClasses} />
          </div>
          <div>
            <label className="type-caption mb-1 block text-ink-2">Vencimento</label>
            <input
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>
        <div className="mt-3">
          <p className="type-caption mb-1.5 text-ink-2">Categoria</p>
          <div className="flex flex-wrap gap-1.5">
            {categoriasFiltradas.map((c) => (
              <Chip key={c.id} label={c.nome} selected={categoriaId === c.id} onClick={() => setCategoriaId(c.id)} />
            ))}
          </div>
        </div>
        <div className="mt-3">
          <p className="type-caption mb-1.5 text-ink-2">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_SAIDA.map((s) => (
              <Chip key={s} label={s} selected={status === s} onClick={() => setStatus(s)} />
            ))}
          </div>
        </div>
        {erro && <p className="type-caption mt-2 text-neg">{erro}</p>}
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={salvar} disabled={isPending} className="px-4 py-1.5">
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button variant="ghost" onClick={() => setEditando(false)} disabled={isPending} className="px-4 py-1.5">
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="type-body truncate text-ink">
          {saida.nome}
          {saida.parcela ? <span className="text-ink-3"> · {saida.parcela}</span> : ""}
        </p>
        <p className="type-caption text-ink-3">
          {categoriaNome} · {formatDataCurta(saida.vencimento)} ·{" "}
          <span className={saida.status === "Pago" ? "text-pos" : "text-warn"}>{saida.status}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Amount cents={saida.total_cents} semantic="none" className="type-body text-ink" />
        <button
          type="button"
          onClick={() => setEditando(true)}
          aria-label="Editar"
          className="rounded-sm p-1.5 text-ink-3 hover:bg-bg hover:text-ink"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={remover}
          disabled={isPending}
          aria-label="Excluir"
          className="rounded-sm p-1.5 text-ink-3 hover:bg-neg-tint hover:text-on-neg-tint disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function CartaoCard({ view, categorias }: { view: CartaoView; categorias: Categoria[] }) {
  const { cartao } = view;
  const [aberto, setAberto] = useState(false);
  const router = useRouter();
  const onMutou = () => router.refresh();

  const temDetalhe = view.compras.length > 0 || view.parcelasFuturas.length > 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-title text-ink">{cartao.nome}</h2>
          <p className="type-caption mt-0.5 text-ink-3">
            Fecha dia {cartao.dia_fechamento} · vence dia {cartao.dia_vencimento}
            {view.contaVinculadaNome ? ` · paga por ${view.contaVinculadaNome}` : " · sem conta vinculada"}
          </p>
        </div>
        <PersonTag pessoa={cartao.dono} />
      </div>

      <div>
        <p className="type-eyebrow text-ink-3">Fatura atual</p>
        <p className="type-headline mt-1 text-ink">
          <Amount cents={view.faturaAtual} semantic="none" />
        </p>
      </div>

      {cartao.limite_cents !== null && <LimiteBar comprometido={view.comprometido} limite={cartao.limite_cents} />}

      {temDetalhe ? (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex items-center justify-between border-t border-hairline pt-3 text-ink-2 transition-colors hover:text-ink"
        >
          <span className="type-label">
            {view.compras.length} compra{view.compras.length === 1 ? "" : "s"} no ciclo
            {view.parcelasFuturas.length > 0 ? ` · ${view.parcelasFuturas.length} parcela(s) futura(s)` : ""}
          </span>
          <ChevronDown size={16} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <p className="type-caption border-t border-hairline pt-3 text-ink-3">Nenhuma compra neste ciclo.</p>
      )}

      {aberto && (
        <div className="flex flex-col gap-4">
          {view.compras.length > 0 && (
            <div>
              <p className="type-eyebrow mb-1 text-ink-3">Compras do ciclo</p>
              <div className="flex flex-col divide-y divide-hairline">
                {view.compras.map((s) => (
                  <CompraRow
                    key={s.id}
                    saida={s}
                    categorias={categorias}
                    categoriaNome={view.categoriaNomePorId[s.categoria_id ?? ""] ?? "Sem categoria"}
                    onMutou={onMutou}
                  />
                ))}
              </div>
            </div>
          )}
          {view.parcelasFuturas.length > 0 && (
            <div>
              <p className="type-eyebrow mb-1.5 text-ink-3">Parcelas futuras</p>
              <ul className="flex flex-col gap-1.5">
                {view.parcelasFuturas.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3">
                    <span className="type-caption min-w-0 truncate text-ink-2">
                      {p.nomeBase} · {p.parcela}
                    </span>
                    <Amount cents={p.totalCents} semantic="none" className="type-caption shrink-0 text-ink-3" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function CartoesList({
  cartoes,
  categorias,
}: {
  cartoes: CartaoView[];
  categorias: Categoria[];
  mesLabel: string;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
      {cartoes.map((view) => (
        <CartaoCard key={view.cartao.id} view={view} categorias={categorias} />
      ))}
    </div>
  );
}
