"use client";

import { useState, useTransition } from "react";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { atualizarEntrada } from "@/app/(app)/lancamentos/actions";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import type { Entrada, EntradaStatus } from "@/lib/domain/types";

const STATUS: { label: string; value: EntradaStatus }[] = [
  { label: "A receber", value: "Não recebido" },
  { label: "Recebido", value: "Recebido" },
];

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="type-caption mb-1 block text-ink-2">{label}</label>
      {children}
    </div>
  );
}

/**
 * Edição inline de uma entrada (nome, valor, data, conta, status), pela mesma
 * ação da tela de Lançamentos — que ajusta o saldo quando status ou conta
 * mudam. Usado no card "Entradas do mês" do Painel.
 */
export function EditarEntradaForm({
  entrada,
  contas,
  onSalvo,
  onCancelar,
}: {
  entrada: Entrada;
  contas: { id: string; nome: string }[];
  onSalvo: (atualizada: Entrada) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(entrada.nome);
  const [valor, setValor] = useState(formatCentsToBRL(entrada.quantia_cents).replace("R$", "").trim());
  const [data, setData] = useState(entrada.data.slice(0, 10));
  const [status, setStatus] = useState<EntradaStatus>(entrada.status);
  const [contaDestinoId, setContaDestinoId] = useState(entrada.conta_destino_id);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function salvar() {
    let quantiaCents: number;
    try {
      quantiaCents = parseCentsFromBRL(valor);
    } catch {
      setErro("Valor inválido.");
      return;
    }
    startTransition(async () => {
      const { error } = await atualizarEntrada({
        id: entrada.id,
        nome,
        quantiaCents,
        data,
        status,
        statusAnterior: entrada.status,
        quantiaCentsAnterior: entrada.quantia_cents,
        contaDestinoId,
        contaDestinoIdAnterior: entrada.conta_destino_id,
      });
      if (error) {
        setErro(error);
        return;
      }
      onSalvo({ ...entrada, nome: nome.trim(), quantia_cents: quantiaCents, data, status, conta_destino_id: contaDestinoId });
    });
  }

  return (
    <div className="rounded-md bg-bg px-3 py-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Campo label="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClasses} />
        </Campo>
        <Campo label="Valor">
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={`figures ${inputClasses}`} />
        </Campo>
        <Campo label="Data">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={`${inputClasses} max-w-full appearance-none`} />
        </Campo>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3">
        <div>
          <p className="type-caption mb-1.5 text-ink-2">Conta</p>
          <div className="flex flex-wrap gap-1.5">
            {contas.map((c) => (
              <Chip key={c.id} label={c.nome} selected={contaDestinoId === c.id} onClick={() => setContaDestinoId(c.id)} />
            ))}
          </div>
        </div>
        <div>
          <p className="type-caption mb-1.5 text-ink-2">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS.map((s) => (
              <Chip key={s.value} label={s.label} selected={status === s.value} onClick={() => setStatus(s.value)} />
            ))}
          </div>
        </div>
      </div>
      {erro && <p className="type-caption mt-2 text-neg">{erro}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancelar} className="px-3 py-1.5">
          Cancelar
        </Button>
        <Button type="button" onClick={salvar} disabled={isPending} className="px-3 py-1.5">
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
