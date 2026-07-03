"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { PersonDot } from "@/components/ui/person-tag";
import { inputClasses } from "@/components/ui/field";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import {
  atualizarEntrada,
  atualizarSaida,
  atualizarTransferencia,
  excluirEntrada,
  excluirSaida,
  excluirTransferencia,
} from "./actions";
import type { Categoria, Entrada, EntradaStatus, Saida, SaidaStatus, Transferencia } from "@/lib/domain/types";

const STATUS_SAIDA: SaidaStatus[] = ["A pagar", "Pago"];
const STATUS_ENTRADA: { label: string; value: EntradaStatus }[] = [
  { label: "A receber", value: "Não recebido" },
  { label: "Recebido", value: "Recebido" },
];

type CampoOrdenacao = "data" | "valor";

function isoParaInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function formatDataCurta(iso: string | null): string {
  if (!iso) return "—";
  const [, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}`;
}

function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

const ROW_GRID =
  "hidden xl:grid xl:grid-cols-[14px_minmax(0,1.3fr)_minmax(0,0.9fr)_76px_minmax(0,0.9fr)_60px_110px_96px_64px] items-center gap-3";

function LinhaBase({ children }: { children: React.ReactNode }) {
  return <div className={`${ROW_GRID} border-b border-hairline px-3 py-2 last:border-b-0`}>{children}</div>;
}

/** Status como selo discreto: concluído (pago/recebido) em verde-tinta,
 * pendente em âmbar-tinta. Clique abre a edição. */
function StatusTag({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`type-caption rounded-xs px-2 py-1 font-medium transition-colors hover:brightness-95 ${
        done ? "bg-brand-tint text-on-brand-tint" : "bg-warn-tint text-warn"
      }`}
    >
      {label}
    </button>
  );
}

function CabecalhoOrdenavel({
  label,
  campo,
  ordenacao,
  onClick,
  align = "left",
}: {
  label: string;
  campo: CampoOrdenacao;
  ordenacao: { campo: CampoOrdenacao; direcao: "asc" | "desc" };
  onClick: () => void;
  align?: "left" | "right";
}) {
  const ativo = ordenacao.campo === campo;
  const Icone = ativo ? (ordenacao.direcao === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`type-eyebrow flex items-center gap-1 hover:text-ink ${
        align === "right" ? "justify-end" : ""
      } ${ativo ? "text-ink" : "text-ink-3"}`}
    >
      {label}
      <Icone size={11} />
    </button>
  );
}

/** Abaixo de xl a tabela não cabe (sidebar + colunas não têm espaço) — vira
 * card empilhado com as mesmas ações, em vez de forçar scroll horizontal que
 * esconde status e exclusão fora da viewport. */
function CartaoColapsado({
  pessoa,
  titulo,
  subtitulo,
  valorCents,
  valorClassName,
  statusChip,
  onEditar,
  onExcluir,
  excluindo,
}: {
  pessoa: Saida["pessoa"];
  titulo: string;
  subtitulo: string;
  valorCents: number;
  valorClassName: string;
  statusChip: React.ReactNode;
  onEditar: () => void;
  onExcluir: () => void;
  excluindo: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-hairline px-3 py-3 last:border-b-0 xl:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <PersonDot pessoa={pessoa} className="mt-2" />
          <div className="min-w-0">
            <p className="type-body truncate text-ink">{titulo}</p>
            <p className="type-caption text-ink-3">{subtitulo}</p>
          </div>
        </div>
        <Amount cents={valorCents} semantic="none" className={`type-body shrink-0 text-right ${valorClassName}`} />
      </div>
      <div className="flex items-center justify-between gap-2">
        {statusChip}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onEditar}
            aria-label="Editar"
            className="rounded-sm p-2 text-ink-2 hover:bg-bg hover:text-ink"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onExcluir}
            disabled={excluindo}
            aria-label="Excluir"
            className="rounded-sm p-2 text-ink-2 hover:bg-neg-tint hover:text-on-neg-tint disabled:opacity-40"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoEdit({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="type-caption mb-1 block text-ink-2">{label}</label>
      {children}
    </div>
  );
}

function SaidaRow({
  saida,
  categorias,
  categoriaNome,
  destinoNome,
  onRemovido,
}: {
  saida: Saida;
  categorias: Categoria[];
  categoriaNome: string;
  destinoNome: string;
  onRemovido: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(saida.nome);
  const [valor, setValor] = useState(centsToInputValue(saida.total_cents));
  const [data, setData] = useState(isoParaInput(saida.data));
  const [vencimento, setVencimento] = useState(isoParaInput(saida.vencimento));
  const [parcela, setParcela] = useState(saida.parcela ?? "");
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
      setEditando(false);
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
      onRemovido(saida.id);
    });
  }

  if (editando) {
    return (
      <div className="border-b border-hairline bg-bg px-3 py-4 last:border-b-0">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <CampoEdit label="Nome">
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClasses} />
          </CampoEdit>
          <CampoEdit label="Valor">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              className={`figures ${inputClasses}`}
            />
          </CampoEdit>
          <CampoEdit label="Data da compra">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClasses} />
          </CampoEdit>
          <CampoEdit label="Vencimento (mês da fatura)">
            <input
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
              className={inputClasses}
            />
          </CampoEdit>
          <CampoEdit label="Parcela">
            <input
              value={parcela}
              onChange={(e) => setParcela(e.target.value)}
              placeholder="ex.: 02/10"
              className={inputClasses}
            />
          </CampoEdit>
        </div>

        <p className="type-caption mt-3 text-ink-2">
          {saida.metodo} · {destinoNome}
        </p>

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

        <div className="mt-4 flex gap-2">
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
    <>
      <LinhaBase>
        <PersonDot pessoa={saida.pessoa} />
        <span className="type-body truncate text-ink">
          {saida.nome}
          {saida.parcela ? <span className="text-ink-3"> · {saida.parcela}</span> : ""}
        </span>
        <span className="type-caption truncate text-ink-2">{categoriaNome}</span>
        <span className="type-caption truncate text-ink-2">{saida.metodo}</span>
        <span className="type-caption truncate text-ink-2">{destinoNome}</span>
        <span className="type-caption figures text-ink-2">{formatDataCurta(saida.vencimento)}</span>
        <Amount cents={saida.total_cents} semantic="none" className="type-body text-right text-ink" />
        <span className="flex justify-center">
          <StatusTag label={saida.status} done={saida.status === "Pago"} onClick={() => setEditando(true)} />
        </span>
        <span className="flex justify-end gap-0.5">
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
        </span>
      </LinhaBase>
      <CartaoColapsado
        pessoa={saida.pessoa}
        titulo={saida.nome + (saida.parcela ? ` · ${saida.parcela}` : "")}
        subtitulo={`${categoriaNome} · ${saida.metodo} · ${destinoNome} · ${formatDataCurta(saida.vencimento)}`}
        valorCents={saida.total_cents}
        valorClassName="text-ink"
        statusChip={<StatusTag label={saida.status} done={saida.status === "Pago"} onClick={() => setEditando(true)} />}
        onEditar={() => setEditando(true)}
        onExcluir={remover}
        excluindo={isPending}
      />
    </>
  );
}

function EntradaRow({
  entrada,
  destinoNome,
  contas,
  onRemovido,
}: {
  entrada: Entrada;
  destinoNome: string;
  contas: { id: string; nome: string }[];
  onRemovido: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(entrada.nome);
  const [valor, setValor] = useState(centsToInputValue(entrada.quantia_cents));
  const [data, setData] = useState(isoParaInput(entrada.data));
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
      setErro(null);
      setEditando(false);
    });
  }

  function remover() {
    if (!confirm(`Excluir "${entrada.nome}"?`)) return;
    startTransition(async () => {
      const { error } = await excluirEntrada({
        id: entrada.id,
        status: entrada.status,
        quantiaCents: entrada.quantia_cents,
        contaDestinoId: entrada.conta_destino_id,
      });
      if (error) {
        setErro(error);
        return;
      }
      onRemovido(entrada.id);
    });
  }

  if (editando) {
    return (
      <div className="border-b border-hairline bg-bg px-3 py-4 last:border-b-0">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <CampoEdit label="Nome">
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClasses} />
          </CampoEdit>
          <CampoEdit label="Valor">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              className={`figures ${inputClasses}`}
            />
          </CampoEdit>
          <CampoEdit label="Data">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClasses} />
          </CampoEdit>
        </div>

        <div className="mt-3">
          <p className="type-caption mb-1.5 text-ink-2">Conta</p>
          <div className="flex flex-wrap gap-1.5">
            {contas.map((c) => (
              <Chip key={c.id} label={c.nome} selected={contaDestinoId === c.id} onClick={() => setContaDestinoId(c.id)} />
            ))}
          </div>
        </div>

        <div className="mt-3">
          <p className="type-caption mb-1.5 text-ink-2">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ENTRADA.map((s) => (
              <Chip key={s.value} label={s.label} selected={status === s.value} onClick={() => setStatus(s.value)} />
            ))}
          </div>
        </div>

        {erro && <p className="type-caption mt-2 text-neg">{erro}</p>}

        <div className="mt-4 flex gap-2">
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

  const statusLabel = entrada.status === "Recebido" ? "Recebido" : "A receber";

  return (
    <>
      <LinhaBase>
        <PersonDot pessoa={entrada.pessoa} />
        <span className="type-body truncate text-ink">{entrada.nome}</span>
        <span className="type-caption truncate text-ink-3">—</span>
        <span className="type-caption truncate text-ink-2">Entrada</span>
        <span className="type-caption truncate text-ink-2">{destinoNome}</span>
        <span className="type-caption figures text-ink-2">{formatDataCurta(entrada.data)}</span>
        <Amount cents={entrada.quantia_cents} semantic="none" className="type-body text-right text-pos" />
        <span className="flex justify-center">
          <StatusTag label={statusLabel} done={entrada.status === "Recebido"} onClick={() => setEditando(true)} />
        </span>
        <span className="flex justify-end gap-0.5">
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
        </span>
      </LinhaBase>
      <CartaoColapsado
        pessoa={entrada.pessoa}
        titulo={entrada.nome}
        subtitulo={`Entrada · ${destinoNome} · ${formatDataCurta(entrada.data)}`}
        valorCents={entrada.quantia_cents}
        valorClassName="text-pos"
        statusChip={
          <StatusTag label={statusLabel} done={entrada.status === "Recebido"} onClick={() => setEditando(true)} />
        }
        onEditar={() => setEditando(true)}
        onExcluir={remover}
        excluindo={isPending}
      />
    </>
  );
}

/** Selo neutro que marca a linha como transferência (não é saída nem entrada,
 * então não ganha cor de dinheiro). */
function TransferenciaTag() {
  return (
    <span className="type-caption inline-flex items-center gap-1 rounded-xs bg-track px-2 py-1 font-medium text-ink-2">
      <ArrowLeftRight size={11} />
      Transferência
    </span>
  );
}

function TransferenciaRow({
  transferencia,
  deNome,
  paraNome,
  onRemovido,
}: {
  transferencia: Transferencia;
  deNome: string;
  paraNome: string;
  onRemovido: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(transferencia.nome);
  const [valor, setValor] = useState(centsToInputValue(transferencia.valor_cents));
  const [data, setData] = useState(isoParaInput(transferencia.data));
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rota = `${deNome} → ${paraNome}`;

  function salvar() {
    let valorCents: number;
    try {
      valorCents = parseCentsFromBRL(valor);
    } catch {
      setErro("Valor inválido.");
      return;
    }
    startTransition(async () => {
      const { error } = await atualizarTransferencia({
        id: transferencia.id,
        nome,
        valorCents,
        data,
        valorCentsAnterior: transferencia.valor_cents,
        deContaId: transferencia.de_conta_id,
        paraContaId: transferencia.para_conta_id,
      });
      if (error) {
        setErro(error);
        return;
      }
      setErro(null);
      setEditando(false);
    });
  }

  function remover() {
    if (!confirm(`Excluir a transferência "${transferencia.nome}"?`)) return;
    startTransition(async () => {
      const { error } = await excluirTransferencia({
        id: transferencia.id,
        valorCents: transferencia.valor_cents,
        deContaId: transferencia.de_conta_id,
        paraContaId: transferencia.para_conta_id,
      });
      if (error) {
        setErro(error);
        return;
      }
      onRemovido(transferencia.id);
    });
  }

  if (editando) {
    return (
      <div className="border-b border-hairline bg-bg px-3 py-4 last:border-b-0">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <CampoEdit label="Descrição">
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClasses} />
          </CampoEdit>
          <CampoEdit label="Valor">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              className={`figures ${inputClasses}`}
            />
          </CampoEdit>
          <CampoEdit label="Data">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClasses} />
          </CampoEdit>
        </div>

        <p className="type-caption mt-3 text-ink-2">{rota}</p>

        {erro && <p className="type-caption mt-2 text-neg">{erro}</p>}

        <div className="mt-4 flex gap-2">
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
    <>
      <LinhaBase>
        <PersonDot pessoa={transferencia.pessoa} />
        <span className="type-body truncate text-ink">{transferencia.nome}</span>
        <span className="type-caption truncate text-ink-3">Transferência</span>
        <span className="type-caption truncate text-ink-3">—</span>
        <span className="type-caption truncate text-ink-2">{rota}</span>
        <span className="type-caption figures text-ink-2">{formatDataCurta(transferencia.data)}</span>
        <Amount cents={transferencia.valor_cents} semantic="none" className="type-body text-right text-ink-2" />
        <span className="flex justify-center">
          <TransferenciaTag />
        </span>
        <span className="flex justify-end gap-0.5">
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
        </span>
      </LinhaBase>
      <CartaoColapsado
        pessoa={transferencia.pessoa}
        titulo={transferencia.nome}
        subtitulo={`${rota} · ${formatDataCurta(transferencia.data)}`}
        valorCents={transferencia.valor_cents}
        valorClassName="text-ink-2"
        statusChip={<TransferenciaTag />}
        onEditar={() => setEditando(true)}
        onExcluir={remover}
        excluindo={isPending}
      />
    </>
  );
}

export function LancamentosList({
  saidasIniciais,
  entradasIniciais,
  transferenciasIniciais,
  categorias,
  contas,
  contaPorId,
  cartaoPorId,
}: {
  saidasIniciais: Saida[];
  entradasIniciais: Entrada[];
  transferenciasIniciais: Transferencia[];
  categorias: Categoria[];
  contas: { id: string; nome: string }[];
  contaPorId: Map<string, string>;
  cartaoPorId: Map<string, string>;
}) {
  const [saidas, setSaidas] = useState(saidasIniciais);
  const [entradas, setEntradas] = useState(entradasIniciais);
  const [transferencias, setTransferencias] = useState(transferenciasIniciais);
  const [ordenacao, setOrdenacao] = useState<{ campo: CampoOrdenacao; direcao: "asc" | "desc" }>({
    campo: "data",
    direcao: "desc",
  });

  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);

  function destinoDaSaida(s: Saida): string {
    const id = s.metodo === "Débito" ? s.conta_id : s.cartao_id;
    return (id && (s.metodo === "Débito" ? contaPorId.get(id) : cartaoPorId.get(id))) ?? "—";
  }

  function alternarOrdenacao(campo: CampoOrdenacao) {
    setOrdenacao((atual) =>
      atual.campo === campo ? { campo, direcao: atual.direcao === "asc" ? "desc" : "asc" } : { campo, direcao: "desc" }
    );
  }

  const totalSaidas = useMemo(() => saidas.reduce((sum, s) => sum + s.total_cents, 0), [saidas]);
  const totalEntradas = useMemo(() => entradas.reduce((sum, e) => sum + e.quantia_cents, 0), [entradas]);
  const totalTransferencias = useMemo(
    () => transferencias.reduce((sum, t) => sum + t.valor_cents, 0),
    [transferencias]
  );

  const itens = useMemo(() => {
    const saidaItens = saidas.map((s) => ({
      key: `saida-${s.id}`,
      data: s.vencimento ?? s.data ?? s.created_at,
      valorCents: s.total_cents,
      node: (
        <SaidaRow
          key={s.id}
          saida={s}
          categorias={categorias}
          categoriaNome={categoriaPorId.get(s.categoria_id ?? "") ?? "Sem categoria"}
          destinoNome={destinoDaSaida(s)}
          onRemovido={(id) => setSaidas((prev) => prev.filter((s) => s.id !== id))}
        />
      ),
    }));
    const entradaItens = entradas.map((e) => ({
      key: `entrada-${e.id}`,
      data: e.data,
      valorCents: e.quantia_cents,
      node: (
        <EntradaRow
          key={e.id}
          entrada={e}
          destinoNome={contaPorId.get(e.conta_destino_id) ?? "—"}
          contas={contas}
          onRemovido={(id) => setEntradas((prev) => prev.filter((e) => e.id !== id))}
        />
      ),
    }));
    const transferenciaItens = transferencias.map((t) => ({
      key: `transferencia-${t.id}`,
      data: t.data ?? t.created_at,
      valorCents: t.valor_cents,
      node: (
        <TransferenciaRow
          key={t.id}
          transferencia={t}
          deNome={contaPorId.get(t.de_conta_id) ?? "—"}
          paraNome={contaPorId.get(t.para_conta_id) ?? "—"}
          onRemovido={(id) => setTransferencias((prev) => prev.filter((t) => t.id !== id))}
        />
      ),
    }));
    const todos = [...saidaItens, ...entradaItens, ...transferenciaItens];
    const direcaoMult = ordenacao.direcao === "asc" ? 1 : -1;
    return todos.sort((a, b) => {
      if (ordenacao.campo === "valor") return (a.valorCents - b.valorCents) * direcaoMult;
      return (a.data < b.data ? -1 : a.data > b.data ? 1 : 0) * direcaoMult;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saidas, entradas, transferencias, categorias, categoriaPorId, contaPorId, cartaoPorId, ordenacao]);

  if (itens.length === 0) {
    return (
      <div className="rounded-md border border-hairline bg-surface p-8 text-center">
        <p className="type-body text-ink-2">Nenhum lançamento neste mês com os filtros atuais.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-hairline bg-surface">
      <div className={`${ROW_GRID} border-b border-hairline px-3 py-2.5`}>
        <span />
        <span className="type-eyebrow text-ink-3">Nome</span>
        <span className="type-eyebrow text-ink-3">Categoria</span>
        <span className="type-eyebrow text-ink-3">Método</span>
        <span className="type-eyebrow text-ink-3">Conta / Cartão</span>
        <CabecalhoOrdenavel label="Data" campo="data" ordenacao={ordenacao} onClick={() => alternarOrdenacao("data")} />
        <CabecalhoOrdenavel
          label="Valor"
          campo="valor"
          ordenacao={ordenacao}
          onClick={() => alternarOrdenacao("valor")}
          align="right"
        />
        <span className="type-eyebrow text-center text-ink-3">Status</span>
        <span className="type-eyebrow text-right text-ink-3">Ações</span>
      </div>

      {itens.map((item) => item.node)}

      {/* Fecho contábil: régua dupla e totais do recorte filtrado. */}
      <div className="rule-ledger" aria-hidden="true" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-3 py-3">
        <p className="type-caption text-ink-3">
          {itens.length} {itens.length === 1 ? "lançamento" : "lançamentos"}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {saidas.length > 0 && (
            <p className="type-label text-ink-2">
              Saídas <span className="figures font-semibold text-ink">{formatCentsToBRL(totalSaidas)}</span>
            </p>
          )}
          {entradas.length > 0 && (
            <p className="type-label text-ink-2">
              Entradas <span className="figures font-semibold text-pos">{formatCentsToBRL(totalEntradas)}</span>
            </p>
          )}
          {saidas.length > 0 && entradas.length > 0 && (
            <p className="type-label text-ink-2">
              Resultado{" "}
              <Amount cents={totalEntradas - totalSaidas} semantic="both" className="type-label font-semibold" />
            </p>
          )}
          {transferencias.length > 0 && (
            <p className="type-label text-ink-3">
              Transferido <span className="figures font-semibold text-ink-2">{formatCentsToBRL(totalTransferencias)}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
