"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, ChevronDown, Pencil, Trash2 } from "lucide-react";
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
import { marcarFaturaComoPaga } from "./actions";
import type { Cartao, Categoria, Saida, SaidaStatus } from "@/lib/domain/types";

const STATUS_SAIDA: SaidaStatus[] = ["A pagar", "Pago"];

interface FaturaView {
  titulo: string;
  vencimentoLabel: string;
  totalCents: number;
  compras: Saida[];
}

interface FaturaAVencer extends FaturaView {
  temPendente: boolean;
  totalPendenteCents: number;
  cicloAno: number;
  cicloMes: number;
}

export interface CartaoView {
  cartao: Cartao;
  comprometido: number;
  disponivel: number | null;
  contaVinculadaNome: string | null;
  aVencer: FaturaAVencer;
  doMes: FaturaView;
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
          {categoriaNome} · {formatDataCurta(saida.data)} ·{" "}
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

function ListaCompras({
  compras,
  categorias,
  categoriaNomePorId,
  onMutou,
}: {
  compras: Saida[];
  categorias: Categoria[];
  categoriaNomePorId: Record<string, string>;
  onMutou: () => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-hairline">
      {compras.map((s) => (
        <CompraRow
          key={s.id}
          saida={s}
          categorias={categorias}
          categoriaNome={categoriaNomePorId[s.categoria_id ?? ""] ?? "Sem categoria"}
          onMutou={onMutou}
        />
      ))}
    </div>
  );
}

function CartaoCard({ view, categorias }: { view: CartaoView; categorias: Categoria[] }) {
  const { cartao, aVencer, doMes } = view;
  const router = useRouter();
  const onMutou = () => router.refresh();

  const [abertoAVencer, setAbertoAVencer] = useState(aVencer.temPendente);
  const [abertoDoMes, setAbertoDoMes] = useState(false);
  const [erroPagar, setErroPagar] = useState<string | null>(null);
  const [pagando, startPagar] = useTransition();

  const aVencerPaga = aVencer.compras.length > 0 && !aVencer.temPendente;

  function pagarFatura() {
    if (!confirm(`Marcar como paga a fatura de ${formatCentsToBRL(aVencer.totalPendenteCents)}?`)) return;
    startPagar(async () => {
      const { error } = await marcarFaturaComoPaga({
        cartaoId: cartao.id,
        ano: aVencer.cicloAno,
        mes: aVencer.cicloMes,
      });
      if (error) {
        setErroPagar(error);
        return;
      }
      setErroPagar(null);
      onMutou();
    });
  }

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

      {cartao.limite_cents !== null && <LimiteBar comprometido={view.comprometido} limite={cartao.limite_cents} />}

      {/* Fatura a vencer (mês anterior) — a acionável */}
      <div className="rounded-sm border border-hairline-strong bg-bg p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="type-label text-ink">{aVencer.titulo}</p>
            <p className="type-caption text-ink-3">a vencer · {aVencer.vencimentoLabel}</p>
          </div>
          <Amount cents={aVencer.totalCents} semantic="none" className="type-title text-ink" />
        </div>

        {aVencer.compras.length === 0 ? (
          <p className="type-caption mt-2 text-ink-3">Sem fatura a vencer.</p>
        ) : aVencerPaga ? (
          <p className="type-label mt-3 flex items-center gap-1.5 text-pos">
            <Check size={15} /> Fatura paga
          </p>
        ) : (
          <Button variant="primary" onClick={pagarFatura} disabled={pagando} className="mt-3 w-full py-2.5">
            <CheckCheck size={16} />
            {pagando ? "Pagando..." : `Marcar fatura como paga · ${formatCentsToBRL(aVencer.totalPendenteCents)}`}
          </Button>
        )}
        {erroPagar && <p className="type-caption mt-2 text-neg">{erroPagar}</p>}

        {aVencer.compras.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setAbertoAVencer((v) => !v)}
              aria-expanded={abertoAVencer}
              className="mt-3 flex w-full items-center justify-between text-ink-2 transition-colors hover:text-ink"
            >
              <span className="type-caption">
                {aVencer.compras.length} compra{aVencer.compras.length === 1 ? "" : "s"}
              </span>
              <ChevronDown size={15} className={`transition-transform ${abertoAVencer ? "rotate-180" : ""}`} />
            </button>
            {abertoAVencer && (
              <div className="mt-1">
                <ListaCompras
                  compras={aVencer.compras}
                  categorias={categorias}
                  categoriaNomePorId={view.categoriaNomePorId}
                  onMutou={onMutou}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Fatura do mês em foco — ainda acumulando */}
      <div>
        <button
          type="button"
          onClick={() => setAbertoDoMes((v) => !v)}
          aria-expanded={abertoDoMes}
          disabled={doMes.compras.length === 0}
          className="flex w-full items-baseline justify-between gap-3 text-left disabled:cursor-default"
        >
          <div>
            <p className="type-label text-ink">{doMes.titulo}</p>
            <p className="type-caption text-ink-3">do mês · {doMes.vencimentoLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Amount cents={doMes.totalCents} semantic="none" className="type-title text-ink" />
            {doMes.compras.length > 0 && (
              <ChevronDown size={15} className={`text-ink-3 transition-transform ${abertoDoMes ? "rotate-180" : ""}`} />
            )}
          </div>
        </button>
        {abertoDoMes && doMes.compras.length > 0 && (
          <div className="mt-2">
            <ListaCompras
              compras={doMes.compras}
              categorias={categorias}
              categoriaNomePorId={view.categoriaNomePorId}
              onMutou={onMutou}
            />
          </div>
        )}
        {doMes.compras.length === 0 && <p className="type-caption mt-1 text-ink-3">Nenhuma compra ainda neste mês.</p>}
      </div>
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
