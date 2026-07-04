"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PersonTag } from "@/components/ui/person-tag";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { progressoPercent } from "@/lib/domain/orcamento";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import { criarMeta, atualizarMeta, excluirMeta } from "./actions";
import type { CategoriaDono, Conta, MetaPoupanca } from "@/lib/domain/types";

const DONOS: CategoriaDono[] = ["Diego", "Vitor", "Ambos"];

function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function formatDataCurta(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function DonoBadge({ dono }: { dono: CategoriaDono }) {
  if (dono === "Diego" || dono === "Vitor") return <PersonTag pessoa={dono} />;
  return (
    <span className="type-caption inline-flex items-center rounded-xs bg-hairline px-1.5 py-0.5 font-medium text-ink-2">
      {dono}
    </span>
  );
}

export interface MetaView {
  meta: MetaPoupanca;
  /** Progresso resolvido: saldo ao vivo da conta vinculada, ou valor_atual_cents manual. */
  atualCents: number;
  contaNome: string | null;
}

function MetaCard({ view, contas }: { view: MetaView; contas: Conta[] }) {
  const router = useRouter();
  const onMutou = () => router.refresh();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(view.meta.nome);
  const [dono, setDono] = useState<CategoriaDono>(view.meta.dono);
  const [valorAlvo, setValorAlvo] = useState(centsToInputValue(view.meta.valor_alvo_cents));
  const [valorAtual, setValorAtual] = useState(centsToInputValue(view.meta.valor_atual_cents));
  const [contaId, setContaId] = useState(view.meta.conta_id ?? "");
  const [dataAlvo, setDataAlvo] = useState(view.meta.data_alvo ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmar = useConfirm();
  const toast = useToast();

  const pct = progressoPercent(view.atualCents, view.meta.valor_alvo_cents);
  const atingiu = view.atualCents >= view.meta.valor_alvo_cents;
  const faltam = view.meta.valor_alvo_cents - view.atualCents;

  function salvar() {
    const formData = new FormData();
    formData.set("nome", nome);
    formData.set("dono", dono);
    formData.set("valorAlvo", valorAlvo);
    formData.set("valorAtual", valorAtual);
    formData.set("contaId", contaId);
    formData.set("dataAlvo", dataAlvo);
    startTransition(async () => {
      const { error } = await atualizarMeta(view.meta.id, formData);
      if (error) {
        setErro(error);
        return;
      }
      setErro(null);
      setEditando(false);
      onMutou();
    });
  }

  async function excluir() {
    if (!(await confirmar(`Excluir a meta "${view.meta.nome}"?`))) return;
    startTransition(async () => {
      const { error } = await excluirMeta(view.meta.id);
      if (error) {
        setErro(error);
        return;
      }
      toast(`Meta "${view.meta.nome}" excluída.`);
      onMutou();
    });
  }

  if (editando) {
    return (
      <Card className="flex flex-col gap-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="type-title border-none bg-transparent text-ink outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {DONOS.map((d) => (
            <Chip key={d} label={d} selected={dono === d} onClick={() => setDono(d)} />
          ))}
        </div>
        <div>
          <label className="type-caption mb-1 block text-ink-2">Valor-alvo</label>
          <input
            value={valorAlvo}
            onChange={(e) => setValorAlvo(e.target.value)}
            inputMode="decimal"
            className="figures w-40 rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
          />
        </div>
        <div>
          <label className="type-caption mb-1 block text-ink-2">
            Vincular a uma conta (progresso segue o saldo dela ao vivo)
          </label>
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Nenhuma" selected={contaId === ""} onClick={() => setContaId("")} />
            {contas.map((c) => (
              <Chip key={c.id} label={c.nome} selected={contaId === c.id} onClick={() => setContaId(c.id)} />
            ))}
          </div>
        </div>
        {!contaId && (
          <div>
            <label className="type-caption mb-1 block text-ink-2">Valor atual (manual, sem conta vinculada)</label>
            <input
              value={valorAtual}
              onChange={(e) => setValorAtual(e.target.value)}
              inputMode="decimal"
              className="figures w-40 rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
            />
          </div>
        )}
        <div>
          <label className="type-caption mb-1 block text-ink-2">Data-alvo (opcional)</label>
          <input
            type="date"
            value={dataAlvo}
            onChange={(e) => setDataAlvo(e.target.value)}
            className="w-48 rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
          />
        </div>
        {erro && <p className="type-caption text-neg">{erro}</p>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={salvar} disabled={isPending} className="px-4 py-1.5">
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button variant="ghost" onClick={() => setEditando(false)} disabled={isPending} className="px-4 py-1.5">
            Cancelar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="type-title text-ink">{view.meta.nome}</h3>
        <DonoBadge dono={view.meta.dono} />
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <Amount cents={view.atualCents} semantic="none" className="type-title text-ink" />
        <span className="type-caption text-ink-3">de {formatCentsToBRL(view.meta.valor_alvo_cents)}</span>
      </div>

      <ProgressBar percent={pct} colorClassName={atingiu ? "bg-pos" : "bg-brand"} />

      <div className="flex items-baseline justify-between">
        {atingiu ? (
          <p className="type-caption font-semibold text-pos">Meta atingida!</p>
        ) : (
          <p className="type-caption text-ink-2">
            <span className="figures">{Math.round(pct)}%</span> · faltam{" "}
            <span className="figures">{formatCentsToBRL(faltam)}</span>
          </p>
        )}
        {view.meta.data_alvo && <p className="type-caption text-ink-3">até {formatDataCurta(view.meta.data_alvo)}</p>}
      </div>

      {view.contaNome && <p className="type-caption text-ink-3">Segue o saldo de {view.contaNome}</p>}

      <div className="flex gap-2 border-t border-hairline pt-3">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="type-caption text-ink-2 hover:text-ink"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          className="type-caption text-ink-2 hover:text-neg disabled:opacity-40"
        >
          <span className="inline-flex items-center gap-1">
            <Trash2 size={12} /> Excluir
          </span>
        </button>
      </div>
    </Card>
  );
}

function NovaMetaCard({
  contas,
  donoPadrao,
  onCriada,
}: {
  contas: Conta[];
  donoPadrao: CategoriaDono;
  onCriada: () => void;
}) {
  const [nome, setNome] = useState("");
  const [donoSelecionado, setDonoSelecionado] = useState<CategoriaDono>(donoPadrao);
  const [valorAlvo, setValorAlvo] = useState("");
  const [contaId, setContaId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function criar() {
    if (!nome.trim()) {
      setErro("Informe o nome da meta.");
      return;
    }
    let valorAlvoCents: number;
    try {
      valorAlvoCents = parseCentsFromBRL(valorAlvo || "0");
    } catch {
      setErro("Valor-alvo inválido.");
      return;
    }
    if (valorAlvoCents <= 0) {
      setErro("O valor-alvo precisa ser maior que zero.");
      return;
    }
    const formData = new FormData();
    formData.set("nome", nome);
    formData.set("dono", donoSelecionado);
    formData.set("valorAlvo", valorAlvo);
    formData.set("contaId", contaId);
    startTransition(async () => {
      const { error } = await criarMeta(formData);
      if (error) {
        setErro(error);
        return;
      }
      setNome("");
      setValorAlvo("");
      setContaId("");
      setErro(null);
      onCriada();
    });
  }

  return (
    <Card className="flex flex-col gap-3 border-dashed">
      <p className="type-label text-ink-2">Nova meta</p>
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="ex.: Viagem, Reserva de emergência"
        className="type-body rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
      />
      <div className="flex flex-wrap gap-1.5">
        {DONOS.map((d) => (
          <Chip key={d} label={d} selected={donoSelecionado === d} onClick={() => setDonoSelecionado(d)} />
        ))}
      </div>
      <input
        value={valorAlvo}
        onChange={(e) => setValorAlvo(e.target.value)}
        inputMode="decimal"
        placeholder="Valor-alvo"
        className="figures w-full rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
      />
      <div>
        <p className="type-caption mb-1.5 text-ink-2">Vincular a uma conta (opcional)</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Nenhuma" selected={contaId === ""} onClick={() => setContaId("")} />
          {contas.map((c) => (
            <Chip key={c.id} label={c.nome} selected={contaId === c.id} onClick={() => setContaId(c.id)} />
          ))}
        </div>
      </div>
      {erro && <p className="type-caption text-neg">{erro}</p>}
      <Button onClick={criar} disabled={isPending} className="self-start px-5 py-2">
        <span className="flex items-center gap-1.5">
          <Plus size={16} /> {isPending ? "Criando..." : "Criar meta"}
        </span>
      </Button>
    </Card>
  );
}

export function MetasPoupanca({
  views,
  contas,
  donoPadrao,
}: {
  views: MetaView[];
  contas: Conta[];
  donoPadrao: CategoriaDono;
}) {
  const [key, setKey] = useState(0);
  return (
    <div key={key} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <NovaMetaCard contas={contas} donoPadrao={donoPadrao} onCriada={() => setKey((k) => k + 1)} />
      {views.map((view) => (
        <MetaCard key={view.meta.id} view={view} contas={contas} />
      ))}
    </div>
  );
}
