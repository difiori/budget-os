"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  atualizarCartao,
  atualizarCategoria,
  atualizarConta,
  criarCartao,
  criarCategoria,
  criarConta,
  excluirCartao,
  excluirCategoria,
  excluirConta,
} from "./actions";
import type { Cartao, CartaoTipo, Categoria, CategoriaDono, Conta, Pessoa } from "@/lib/domain/types";

const PESSOAS: Pessoa[] = ["Diego", "Vitor"];
const DONOS_CATEGORIA: CategoriaDono[] = ["Diego", "Vitor", "Ambos"];
const TIPOS_CARTAO: CartaoTipo[] = ["Crédito", "Benefício"];

const TABS = ["Contas", "Cartões", "Categorias"] as const;
type Tab = (typeof TABS)[number];

function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Contas do mesmo dono do cartão aparecem primeiro — evita escolher sem
 * querer a conta da outra pessoa como pagadora da fatura. */
function ordenarContasPorDono(contas: Conta[], dono: Pessoa): Conta[] {
  return [...contas].sort((a, b) => {
    const aMesmoDono = a.dono === dono ? 0 : 1;
    const bMesmoDono = b.dono === dono ? 0 : 1;
    return aMesmoDono - bMesmoDono;
  });
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="type-caption text-neg">{error}</p>;
}

// --- Contas -----------------------------------------------------------

function ContaRow({ conta }: { conta: Conta }) {
  const [nome, setNome] = useState(conta.nome);
  const [dono, setDono] = useState<Pessoa>(conta.dono);
  const [saldo, setSaldo] = useState(centsToInputValue(conta.saldo_atual_cents));
  const [limite, setLimite] = useState(centsToInputValue(conta.limite_cheque_especial_cents ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmar = useConfirm();
  const toast = useToast();

  function salvar() {
    const formData = new FormData();
    formData.set("nome", nome);
    formData.set("dono", dono);
    formData.set("saldo", saldo);
    formData.set("limite", limite);
    startTransition(async () => {
      const { error } = await atualizarConta(conta.id, formData);
      setError(error);
    });
  }

  async function excluir() {
    if (!(await confirmar(`Excluir a conta "${conta.nome}"?`))) return;
    startTransition(async () => {
      const { error } = await excluirConta(conta.id);
      setError(error);
      if (!error) toast(`Conta "${conta.nome}" excluída.`);
    });
  }

  return (
    <Card variant="surface" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="type-title min-w-0 flex-1 border-none bg-transparent text-ink outline-none"
        />
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          aria-label="Excluir conta"
          className="rounded-sm p-2 text-ink-3 hover:bg-neg-tint hover:text-on-neg-tint disabled:opacity-40"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PESSOAS.map((p) => (
          <Chip key={p} label={p} selected={dono === p} onClick={() => setDono(p)} />
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="type-caption mb-1 block text-ink-2">Saldo atual</label>
          <input
            value={saldo}
            onChange={(e) => setSaldo(e.target.value)}
            inputMode="decimal"
            className="figures w-40 rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
          />
        </div>
        <div>
          <label className="type-caption mb-1 block text-ink-2">Cheque especial</label>
          <input
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="figures w-40 rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
          />
          <p className="type-caption mt-1 text-ink-3">Limite de saldo negativo (0 = sem)</p>
        </div>
      </div>

      <ErrorLine error={error} />

      <Button variant="tonal" onClick={salvar} disabled={isPending} className="self-start px-5 py-2">
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </Card>
  );
}

function NovaContaCard({ onCriada }: { onCriada: () => void }) {
  const [nome, setNome] = useState("");
  const [dono, setDono] = useState<Pessoa>("Diego");
  const [saldo, setSaldo] = useState("0,00");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function criar() {
    if (!nome.trim()) {
      setError("Informe o nome da conta.");
      return;
    }
    const formData = new FormData();
    formData.set("nome", nome);
    formData.set("dono", dono);
    formData.set("saldo", saldo);
    startTransition(async () => {
      const { error } = await criarConta(formData);
      if (error) {
        setError(error);
        return;
      }
      setNome("");
      setSaldo("0,00");
      setError(null);
      onCriada();
    });
  }

  return (
    <Card className="flex flex-col gap-3 border-dashed">
      <p className="type-label text-ink-2">Nova conta</p>
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome da conta"
        className="type-body rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
      />
      <div className="flex flex-wrap gap-1.5">
        {PESSOAS.map((p) => (
          <Chip key={p} label={p} selected={dono === p} onClick={() => setDono(p)} />
        ))}
      </div>
      <input
        value={saldo}
        onChange={(e) => setSaldo(e.target.value)}
        inputMode="decimal"
        placeholder="Saldo inicial"
        className="figures w-40 rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
      />
      <ErrorLine error={error} />
      <Button onClick={criar} disabled={isPending} className="self-start px-5 py-2">
        <span className="flex items-center gap-1.5">
          <Plus size={16} /> {isPending ? "Criando..." : "Criar conta"}
        </span>
      </Button>
    </Card>
  );
}

function ContasSection({ contas }: { contas: Conta[] }) {
  const [key, setKey] = useState(0);
  return (
    <div key={key} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <NovaContaCard onCriada={() => setKey((k) => k + 1)} />
      {contas.map((c) => (
        <ContaRow key={c.id} conta={c} />
      ))}
    </div>
  );
}

// --- Cartões ------------------------------------------------------------

function DiaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="type-caption mb-1 block text-ink-2">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="number"
        min={1}
        max={31}
        className="w-20 rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
      />
    </div>
  );
}

function CartaoRow({ cartao, contas }: { cartao: Cartao; contas: Conta[] }) {
  const [nome, setNome] = useState(cartao.nome);
  const [dono, setDono] = useState<Pessoa>(cartao.dono);
  const [tipo, setTipo] = useState<CartaoTipo>(cartao.tipo);
  const [limite, setLimite] = useState(cartao.limite_cents !== null ? centsToInputValue(cartao.limite_cents) : "");
  const [diaFechamento, setDiaFechamento] = useState(String(cartao.dia_fechamento));
  const [diaVencimento, setDiaVencimento] = useState(String(cartao.dia_vencimento));
  const [contaVinculadaId, setContaVinculadaId] = useState(cartao.conta_vinculada_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmar = useConfirm();
  const toast = useToast();

  function salvar() {
    const formData = new FormData();
    formData.set("nome", nome);
    formData.set("dono", dono);
    formData.set("tipo", tipo);
    formData.set("limite", limite);
    formData.set("diaFechamento", diaFechamento);
    formData.set("diaVencimento", diaVencimento);
    formData.set("contaVinculadaId", contaVinculadaId);
    startTransition(async () => {
      const { error } = await atualizarCartao(cartao.id, formData);
      setError(error);
    });
  }

  async function excluir() {
    if (!(await confirmar(`Excluir o cartão "${cartao.nome}"?`))) return;
    startTransition(async () => {
      const { error } = await excluirCartao(cartao.id);
      setError(error);
      if (!error) toast(`Cartão "${cartao.nome}" excluído.`);
    });
  }

  return (
    <Card variant="surface" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="type-title min-w-0 flex-1 border-none bg-transparent text-ink outline-none"
        />
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          aria-label="Excluir cartão"
          className="rounded-sm p-2 text-ink-3 hover:bg-neg-tint hover:text-on-neg-tint disabled:opacity-40"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PESSOAS.map((p) => (
          <Chip key={p} label={p} selected={dono === p} onClick={() => setDono(p)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TIPOS_CARTAO.map((t) => (
          <Chip key={t} label={t} selected={tipo === t} onClick={() => setTipo(t)} />
        ))}
      </div>

      <div>
        <label className="type-caption mb-1 block text-ink-2">Limite (vazio = sem limite)</label>
        <input
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
          inputMode="decimal"
          placeholder="Sem limite"
          className="figures w-40 rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
        />
      </div>

      <div className="flex gap-4">
        <DiaField label="Fechamento (31 = último dia)" value={diaFechamento} onChange={setDiaFechamento} />
        <DiaField label="Vencimento" value={diaVencimento} onChange={setDiaVencimento} />
      </div>

      <div>
        <label className="type-caption mb-1 block text-ink-2">
          Conta vinculada (de onde a fatura é debitada quando paga)
        </label>
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Nenhuma" selected={contaVinculadaId === ""} onClick={() => setContaVinculadaId("")} />
          {ordenarContasPorDono(contas, dono).map((c) => (
            <Chip
              key={c.id}
              label={`${c.nome} (${c.dono})`}
              selected={contaVinculadaId === c.id}
              onClick={() => setContaVinculadaId(c.id)}
            />
          ))}
        </div>
        {(() => {
          const contaEscolhida = contas.find((c) => c.id === contaVinculadaId);
          if (!contaEscolhida || contaEscolhida.dono === dono) return null;
          return (
            <p className="type-caption mt-2 text-neg">
              Essa conta é de {contaEscolhida.dono}, não de {dono} — confirme que é intencional antes de
              salvar.
            </p>
          );
        })()}
      </div>

      <ErrorLine error={error} />

      <Button variant="tonal" onClick={salvar} disabled={isPending} className="self-start px-5 py-2">
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </Card>
  );
}

function NovoCartaoCard({ contas, onCriado }: { contas: Conta[]; onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [dono, setDono] = useState<Pessoa>("Diego");
  const [tipo, setTipo] = useState<CartaoTipo>("Crédito");
  const [limite, setLimite] = useState("");
  const [diaFechamento, setDiaFechamento] = useState("31");
  const [diaVencimento, setDiaVencimento] = useState("10");
  const [contaVinculadaId, setContaVinculadaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function criar() {
    if (!nome.trim()) {
      setError("Informe o nome do cartão.");
      return;
    }
    const formData = new FormData();
    formData.set("nome", nome);
    formData.set("dono", dono);
    formData.set("tipo", tipo);
    formData.set("limite", limite);
    formData.set("diaFechamento", diaFechamento);
    formData.set("diaVencimento", diaVencimento);
    formData.set("contaVinculadaId", contaVinculadaId);
    startTransition(async () => {
      const { error } = await criarCartao(formData);
      if (error) {
        setError(error);
        return;
      }
      setNome("");
      setLimite("");
      setError(null);
      onCriado();
    });
  }

  return (
    <Card className="flex flex-col gap-3 border-dashed">
      <p className="type-label text-ink-2">Novo cartão</p>
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome do cartão"
        className="type-body rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
      />
      <div className="flex flex-wrap gap-1.5">
        {PESSOAS.map((p) => (
          <Chip key={p} label={p} selected={dono === p} onClick={() => setDono(p)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TIPOS_CARTAO.map((t) => (
          <Chip key={t} label={t} selected={tipo === t} onClick={() => setTipo(t)} />
        ))}
      </div>
      <input
        value={limite}
        onChange={(e) => setLimite(e.target.value)}
        inputMode="decimal"
        placeholder="Limite (vazio = sem limite)"
        className="figures w-full rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
      />
      <div className="flex gap-4">
        <DiaField label="Fechamento (31 = último dia)" value={diaFechamento} onChange={setDiaFechamento} />
        <DiaField label="Vencimento" value={diaVencimento} onChange={setDiaVencimento} />
      </div>
      <div>
        <label className="type-caption mb-1 block text-ink-2">
          Conta vinculada (de onde a fatura é debitada quando paga)
        </label>
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Nenhuma" selected={contaVinculadaId === ""} onClick={() => setContaVinculadaId("")} />
          {ordenarContasPorDono(contas, dono).map((c) => (
            <Chip
              key={c.id}
              label={`${c.nome} (${c.dono})`}
              selected={contaVinculadaId === c.id}
              onClick={() => setContaVinculadaId(c.id)}
            />
          ))}
        </div>
        {(() => {
          const contaEscolhida = contas.find((c) => c.id === contaVinculadaId);
          if (!contaEscolhida || contaEscolhida.dono === dono) return null;
          return (
            <p className="type-caption mt-2 text-neg">
              Essa conta é de {contaEscolhida.dono}, não de {dono} — confirme que é intencional antes de
              salvar.
            </p>
          );
        })()}
      </div>
      <ErrorLine error={error} />
      <Button onClick={criar} disabled={isPending} className="self-start px-5 py-2">
        <span className="flex items-center gap-1.5">
          <Plus size={16} /> {isPending ? "Criando..." : "Criar cartão"}
        </span>
      </Button>
    </Card>
  );
}

function CartoesSection({ cartoes, contas }: { cartoes: Cartao[]; contas: Conta[] }) {
  const [key, setKey] = useState(0);
  return (
    <div key={key} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <NovoCartaoCard contas={contas} onCriado={() => setKey((k) => k + 1)} />
      {cartoes.map((c) => (
        <CartaoRow key={c.id} cartao={c} contas={contas} />
      ))}
    </div>
  );
}

// --- Categorias ------------------------------------------------------------

function CategoriaRow({ categoria }: { categoria: Categoria }) {
  const [nome, setNome] = useState(categoria.nome);
  const [dono, setDono] = useState<CategoriaDono>(categoria.dono);
  const [metaMensal, setMetaMensal] = useState(
    categoria.meta_mensal_cents !== null ? centsToInputValue(categoria.meta_mensal_cents) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmar = useConfirm();
  const toast = useToast();

  function salvar() {
    const formData = new FormData();
    formData.set("nome", nome);
    formData.set("dono", dono);
    formData.set("metaMensal", metaMensal);
    startTransition(async () => {
      const { error } = await atualizarCategoria(categoria.id, formData);
      setError(error);
    });
  }

  async function excluir() {
    if (!(await confirmar(`Excluir a categoria "${categoria.nome}"?`))) return;
    startTransition(async () => {
      const { error } = await excluirCategoria(categoria.id);
      setError(error);
      if (!error) toast(`Categoria "${categoria.nome}" excluída.`);
    });
  }

  return (
    <Card variant="surface" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="type-title min-w-0 flex-1 border-none bg-transparent text-ink outline-none"
        />
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          aria-label="Excluir categoria"
          className="rounded-sm p-2 text-ink-3 hover:bg-neg-tint hover:text-on-neg-tint disabled:opacity-40"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DONOS_CATEGORIA.map((d) => (
          <Chip key={d} label={d} selected={dono === d} onClick={() => setDono(d)} />
        ))}
      </div>

      <div>
        <label className="type-caption mb-1 block text-ink-2">Meta mensal (vazio = sem meta)</label>
        <input
          value={metaMensal}
          onChange={(e) => setMetaMensal(e.target.value)}
          inputMode="decimal"
          placeholder="Sem meta"
          className="figures w-40 rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
        />
      </div>

      <ErrorLine error={error} />

      <Button variant="tonal" onClick={salvar} disabled={isPending} className="self-start px-5 py-2">
        {isPending ? "Salvando..." : "Salvar"}
      </Button>
    </Card>
  );
}

function NovaCategoriaCard({ onCriada }: { onCriada: () => void }) {
  const [nome, setNome] = useState("");
  const [dono, setDono] = useState<CategoriaDono>("Ambos");
  const [metaMensal, setMetaMensal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function criar() {
    if (!nome.trim()) {
      setError("Informe o nome da categoria.");
      return;
    }
    const formData = new FormData();
    formData.set("nome", nome);
    formData.set("dono", dono);
    formData.set("metaMensal", metaMensal);
    startTransition(async () => {
      const { error } = await criarCategoria(formData);
      if (error) {
        setError(error);
        return;
      }
      setNome("");
      setMetaMensal("");
      setError(null);
      onCriada();
    });
  }

  return (
    <Card className="flex flex-col gap-3 border-dashed">
      <p className="type-label text-ink-2">Nova categoria</p>
      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome da categoria"
        className="type-body rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
      />
      <div className="flex flex-wrap gap-1.5">
        {DONOS_CATEGORIA.map((d) => (
          <Chip key={d} label={d} selected={dono === d} onClick={() => setDono(d)} />
        ))}
      </div>
      <input
        value={metaMensal}
        onChange={(e) => setMetaMensal(e.target.value)}
        inputMode="decimal"
        placeholder="Meta mensal (opcional)"
        className="figures w-full rounded-sm border border-hairline-strong bg-raised px-3 py-2 text-ink outline-none focus:border-ink-2"
      />
      <ErrorLine error={error} />
      <Button onClick={criar} disabled={isPending} className="self-start px-5 py-2">
        <span className="flex items-center gap-1.5">
          <Plus size={16} /> {isPending ? "Criando..." : "Criar categoria"}
        </span>
      </Button>
    </Card>
  );
}

function CategoriasSection({ categorias }: { categorias: Categoria[] }) {
  const [key, setKey] = useState(0);
  return (
    <div key={key} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <NovaCategoriaCard onCriada={() => setKey((k) => k + 1)} />
      {categorias.map((c) => (
        <CategoriaRow key={c.id} categoria={c} />
      ))}
    </div>
  );
}

// --- Shell ------------------------------------------------------------

export function ConfigTabs({
  contas,
  cartoes,
  categorias,
}: {
  contas: Conta[];
  cartoes: Cartao[];
  categorias: Categoria[];
}) {
  const [tab, setTab] = useState<Tab>("Contas");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <Chip key={t} label={t} selected={tab === t} onClick={() => setTab(t)} />
        ))}
      </div>

      {tab === "Contas" && <ContasSection contas={contas} />}
      {tab === "Cartões" && <CartoesSection cartoes={cartoes} contas={contas} />}
      {tab === "Categorias" && <CategoriasSection categorias={categorias} />}
    </div>
  );
}
