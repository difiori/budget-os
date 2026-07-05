"use client";

import { useState, useTransition } from "react";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { inputClasses } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { nomeSemParcela } from "@/lib/domain/parcelamento";
import { parseCentsFromBRL } from "@/lib/domain/money";
import { atualizarSaida, excluirSaida } from "@/app/(app)/lancamentos/actions";
import type { Categoria, Saida, SaidaStatus } from "@/lib/domain/types";

const STATUS_SAIDA: SaidaStatus[] = ["A pagar", "Pago"];

function isoParaInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}
function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Formulário de edição de uma saída, reutilizável (usado no Extrato e nas
 * Últimas saídas do Painel). Chama as mesmas server actions e avisa o pai
 * quando salva ou exclui — o pai decide como refletir (refresh ou otimista).
 */
export function EditarSaidaForm({
  saida,
  categorias,
  destinoNome,
  onSalvo,
  onExcluido,
  onCancelar,
}: {
  saida: Saida;
  categorias: Categoria[];
  destinoNome: string;
  onSalvo: () => void;
  onExcluido: () => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(nomeSemParcela(saida.nome, saida.parcela));
  const [valor, setValor] = useState(centsToInputValue(saida.total_cents));
  const [data, setData] = useState(isoParaInput(saida.data));
  const [vencimento, setVencimento] = useState(isoParaInput(saida.vencimento));
  const [parcela, setParcela] = useState(saida.parcela ?? "");
  const [categoriaId, setCategoriaId] = useState(saida.categoria_id ?? "");
  const [status, setStatus] = useState<SaidaStatus>(saida.status);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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
        parcela: parcela.trim() || null,
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
      setErro(null);
      onSalvo();
    });
  }

  function excluir() {
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
        toast(`Não foi possível excluir: ${error}`);
        return;
      }
      toast(`"${saida.nome}" excluído.`);
      onExcluido();
    });
  }

  return (
    <div className="rounded-sm bg-bg p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="type-caption mb-1 block text-ink-2">Categoria</label>
          <Combobox
            options={categoriasFiltradas.map((c) => ({ value: c.id, label: c.nome }))}
            value={categoriaId}
            onChange={setCategoriaId}
            placeholder="Sem categoria"
            searchPlaceholder="Buscar categoria"
            clearable
          />
        </div>
        <div>
          <label className="type-caption mb-1 block text-ink-2">Status</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_SAIDA.map((s) => (
              <Chip key={s} label={s} selected={status === s} onClick={() => setStatus(s)} />
            ))}
          </div>
        </div>
      </div>

      <p className="type-caption mt-3 text-ink-3">
        {saida.metodo} · {destinoNome}
      </p>

      {erro && <p className="type-caption mt-2 text-neg">{erro}</p>}

      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" onClick={salvar} disabled={isPending} className="px-4 py-1.5">
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={isPending} className="px-4 py-1.5">
          Cancelar
        </Button>
        <span className="flex-1" />
        <Button variant="danger" onClick={excluir} disabled={isPending} className="px-3 py-1.5">
          Excluir
        </Button>
      </div>
    </div>
  );
}
