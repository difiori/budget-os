"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Amount } from "@/components/ui/amount";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { nomeComParcela, nomeSemParcela } from "@/lib/domain/parcelamento";
import { parseCentsFromBRL } from "@/lib/domain/money";
import { atualizarSaida, excluirSaida } from "../../app/(app)/lancamentos/actions";
import type { Categoria, Saida, SaidaStatus } from "@/lib/domain/types";

const STATUS_SAIDA: SaidaStatus[] = ["A pagar", "Pago"];

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

function SaidaRow({
  saida,
  categorias,
  categoriaNome,
  origemLabel,
  onMutou,
}: {
  saida: Saida;
  categorias: Categoria[];
  categoriaNome: string;
  /** Rótulo opcional da conta/cartão de origem, exibido junto da categoria e data. */
  origemLabel?: string;
  onMutou: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(nomeSemParcela(saida.nome, saida.parcela));
  const [valor, setValor] = useState(centsToInputValue(saida.total_cents));
  const [data, setData] = useState(isoParaInput(saida.data));
  const [vencimento, setVencimento] = useState(isoParaInput(saida.vencimento));
  const [categoriaId, setCategoriaId] = useState(saida.categoria_id ?? "");
  const [status, setStatus] = useState<SaidaStatus>(saida.status);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmar = useConfirm();
  const toast = useToast();

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

  async function remover() {
    if (!(await confirmar(`Excluir "${saida.nome}"?`))) return;
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
      toast(`"${saida.nome}" excluído.`);
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
        <p className="type-body truncate text-ink">{nomeComParcela(saida.nome, saida.parcela)}</p>
        <p className="type-caption text-ink-3">
          {categoriaNome} · {formatDataCurta(saida.data)}
          {origemLabel ? ` · ${origemLabel}` : ""} ·{" "}
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

export function SaidaList({
  saidas,
  categorias,
  categoriaNomePorId,
  origemLabelPorSaidaId,
  onMutou,
}: {
  saidas: Saida[];
  categorias: Categoria[];
  categoriaNomePorId: Record<string, string>;
  /** Rótulo opcional (conta/cartão) por id de saída — usado na tela de Categorias. */
  origemLabelPorSaidaId?: Record<string, string>;
  onMutou: () => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-hairline">
      {saidas.map((s) => (
        <SaidaRow
          key={s.id}
          saida={s}
          categorias={categorias}
          categoriaNome={categoriaNomePorId[s.categoria_id ?? ""] ?? "Sem categoria"}
          origemLabel={origemLabelPorSaidaId?.[s.id]}
          onMutou={onMutou}
        />
      ))}
    </div>
  );
}
