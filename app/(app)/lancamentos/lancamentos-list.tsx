"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpDown, CheckCheck, Pencil, Trash2, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { Combobox } from "@/components/ui/combobox";
import { PersonDot } from "@/components/ui/person-tag";
import { inputClasses } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { nomeComParcela, nomeSemParcela } from "@/lib/domain/parcelamento";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import {
  alternarStatusEntrada,
  alternarStatusSaida,
  atualizarEntrada,
  atualizarSaida,
  atualizarTransferencia,
  definirCategoriaEmLote,
  excluirEntrada,
  excluirSaida,
  excluirTransferencia,
  marcarEntradasComoRecebidas,
  marcarSaidasComoPagas,
} from "./actions";
import {
  FiltrosBar,
  filtrosPadrao,
  ordenar,
  passaFiltro,
  type CampoOrdenacao,
  type Filtros,
  type ItemDescriptor,
  type Ordenacao,
} from "./lancamentos-filtros";
import type { Cartao, Categoria, Conta, Entrada, EntradaStatus, Pessoa, Saida, SaidaStatus, Transferencia } from "@/lib/domain/types";

const STATUS_SAIDA: SaidaStatus[] = ["A pagar", "Pago"];
const STATUS_ENTRADA: { label: string; value: EntradaStatus }[] = [
  { label: "A receber", value: "Não recebido" },
  { label: "Recebido", value: "Recebido" },
];

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
  "hidden xl:grid xl:grid-cols-[14px_minmax(0,1.2fr)_minmax(0,0.8fr)_72px_minmax(0,0.8fr)_58px_58px_104px_92px_60px] items-center gap-3";

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
  // Cor do rótulo é sempre a mesma (consistência); o estado ativo aparece só
  // no ícone (seta cheia em verde), não escurecendo o texto.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`type-eyebrow flex items-center gap-1 text-ink-3 transition-colors hover:text-ink-2 ${
        align === "right" ? "justify-end" : ""
      }`}
    >
      {label}
      <Icone size={11} className={ativo ? "text-brand" : "text-ink-3"} />
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
            <p className="truncate text-[0.875rem] text-ink">{titulo}</p>
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
  onRestaurado,
  onStatusAlterado,
  onAtualizado,
}: {
  saida: Saida;
  categorias: Categoria[];
  categoriaNome: string;
  destinoNome: string;
  onRemovido: (id: string) => void;
  onRestaurado: (saida: Saida) => void;
  onStatusAlterado: (id: string, novo: SaidaStatus) => void;
  onAtualizado: (saida: Saida) => void;
}) {
  const [editando, setEditando] = useState(false);
  // Pré-preenche com o nome base (sem o sufixo "NN/NN"), que a parcela já
  // ocupa no campo próprio — evita salvar o número duplicado no nome.
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
      setEditando(false);
      // Reflete a edição na hora, sem esperar recarregar.
      onAtualizado({
        ...saida,
        nome,
        total_cents: totalCents,
        data,
        vencimento,
        parcela: parcela.trim() || null,
        categoria_id: categoriaId || null,
        status,
      });
    });
  }

  /** Remoção otimista com desfazer: some da lista na hora, e a exclusão real
   * só acontece no servidor se a janela do toast expirar sem "Desfazer". */
  function remover() {
    onRemovido(saida.id);
    const timeoutId = setTimeout(() => {
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
          onRestaurado(saida);
          toast(`Não foi possível excluir "${saida.nome}": ${error}`);
        }
      });
    }, 5000);
    toast(`"${saida.nome}" excluído.`, {
      actionLabel: "Desfazer",
      onAction: () => {
        clearTimeout(timeoutId);
        onRestaurado(saida);
      },
    });
  }

  /** Alterna Pago ↔ A pagar direto pela tag (otimista), sem abrir a edição. */
  function alternarPago() {
    const anterior = saida.status;
    const novo: SaidaStatus = anterior === "Pago" ? "A pagar" : "Pago";
    onStatusAlterado(saida.id, novo);
    startTransition(async () => {
      const { error } = await alternarStatusSaida(saida.id);
      if (error) {
        onStatusAlterado(saida.id, anterior);
        toast(error);
      }
    });
  }

  /** Reabre a edição sempre do estado atual da saída (evita divergência com
   * o que foi alterado pela tag). */
  function abrirEdicao() {
    setNome(nomeSemParcela(saida.nome, saida.parcela));
    setValor(centsToInputValue(saida.total_cents));
    setData(isoParaInput(saida.data));
    setVencimento(isoParaInput(saida.vencimento));
    setParcela(saida.parcela ?? "");
    setCategoriaId(saida.categoria_id ?? "");
    setStatus(saida.status);
    setEditando(true);
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

        <div className="mt-3 max-w-xs">
          <p className="type-caption mb-1.5 text-ink-2">Categoria</p>
          <Combobox
            options={categoriasFiltradas.map((c) => ({ value: c.id, label: c.nome }))}
            value={categoriaId}
            onChange={setCategoriaId}
            placeholder="Sem categoria"
            searchPlaceholder="Buscar categoria"
            clearable
          />
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
        <span className="truncate text-[0.875rem] text-ink">{nomeComParcela(saida.nome, saida.parcela)}</span>
        <span className="type-caption truncate text-ink-2">{categoriaNome}</span>
        <span className="type-caption truncate text-ink-2">{saida.metodo}</span>
        <span className="type-caption truncate text-ink-2">{destinoNome}</span>
        <span className="type-caption figures text-ink-2">{formatDataCurta(saida.created_at)}</span>
        <span className="type-caption figures text-ink-2">{formatDataCurta(saida.vencimento)}</span>
        <Amount cents={saida.total_cents} semantic="none" className="type-body text-right text-ink" />
        <span className="flex justify-center">
          <StatusTag label={saida.status} done={saida.status === "Pago"} onClick={alternarPago} />
        </span>
        <span className="flex justify-end gap-0.5">
          <button
            type="button"
            onClick={abrirEdicao}
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
        titulo={nomeComParcela(saida.nome, saida.parcela)}
        subtitulo={`${categoriaNome} · ${saida.metodo} · ${destinoNome} · reg. ${formatDataCurta(saida.created_at)}${
          saida.vencimento ? ` · venc. ${formatDataCurta(saida.vencimento)}` : ""
        }`}
        valorCents={saida.total_cents}
        valorClassName="text-ink"
        statusChip={<StatusTag label={saida.status} done={saida.status === "Pago"} onClick={alternarPago} />}
        onEditar={abrirEdicao}
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
  onRestaurado,
  onStatusAlterado,
  onAtualizado,
}: {
  entrada: Entrada;
  destinoNome: string;
  contas: { id: string; nome: string }[];
  onRemovido: (id: string) => void;
  onRestaurado: (entrada: Entrada) => void;
  onStatusAlterado: (id: string, novo: EntradaStatus) => void;
  onAtualizado: (entrada: Entrada) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(entrada.nome);
  const [valor, setValor] = useState(centsToInputValue(entrada.quantia_cents));
  const [data, setData] = useState(isoParaInput(entrada.data));
  const [status, setStatus] = useState<EntradaStatus>(entrada.status);
  const [contaDestinoId, setContaDestinoId] = useState(entrada.conta_destino_id);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

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
      onAtualizado({
        ...entrada,
        nome,
        quantia_cents: quantiaCents,
        data,
        status,
        conta_destino_id: contaDestinoId,
      });
    });
  }

  function remover() {
    onRemovido(entrada.id);
    const timeoutId = setTimeout(() => {
      startTransition(async () => {
        const { error } = await excluirEntrada({
          id: entrada.id,
          status: entrada.status,
          quantiaCents: entrada.quantia_cents,
          contaDestinoId: entrada.conta_destino_id,
        });
        if (error) {
          onRestaurado(entrada);
          toast(`Não foi possível excluir "${entrada.nome}": ${error}`);
        }
      });
    }, 5000);
    toast(`"${entrada.nome}" excluído.`, {
      actionLabel: "Desfazer",
      onAction: () => {
        clearTimeout(timeoutId);
        onRestaurado(entrada);
      },
    });
  }

  function alternarRecebido() {
    const anterior = entrada.status;
    const novo: EntradaStatus = anterior === "Recebido" ? "Não recebido" : "Recebido";
    onStatusAlterado(entrada.id, novo);
    startTransition(async () => {
      const { error } = await alternarStatusEntrada(entrada.id);
      if (error) {
        onStatusAlterado(entrada.id, anterior);
        toast(error);
      }
    });
  }

  function abrirEdicao() {
    setNome(entrada.nome);
    setValor(centsToInputValue(entrada.quantia_cents));
    setData(isoParaInput(entrada.data));
    setStatus(entrada.status);
    setContaDestinoId(entrada.conta_destino_id);
    setEditando(true);
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
        <span className="truncate text-[0.875rem] text-ink">{entrada.nome}</span>
        <span className="type-caption truncate text-ink-3">—</span>
        <span className="type-caption truncate text-ink-2">Entrada</span>
        <span className="type-caption truncate text-ink-2">{destinoNome}</span>
        <span className="type-caption figures text-ink-2">{formatDataCurta(entrada.created_at)}</span>
        <span className="type-caption figures text-ink-2">{formatDataCurta(entrada.data)}</span>
        <Amount cents={entrada.quantia_cents} semantic="none" className="type-body text-right text-pos" />
        <span className="flex justify-center">
          <StatusTag label={statusLabel} done={entrada.status === "Recebido"} onClick={alternarRecebido} />
        </span>
        <span className="flex justify-end gap-0.5">
          <button
            type="button"
            onClick={abrirEdicao}
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
        subtitulo={`Entrada · ${destinoNome} · reg. ${formatDataCurta(entrada.created_at)} · ${formatDataCurta(entrada.data)}`}
        valorCents={entrada.quantia_cents}
        valorClassName="text-pos"
        statusChip={
          <StatusTag label={statusLabel} done={entrada.status === "Recebido"} onClick={alternarRecebido} />
        }
        onEditar={abrirEdicao}
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
  onRestaurado,
  onAtualizado,
}: {
  transferencia: Transferencia;
  deNome: string;
  paraNome: string;
  onRemovido: (id: string) => void;
  onRestaurado: (transferencia: Transferencia) => void;
  onAtualizado: (transferencia: Transferencia) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(transferencia.nome);
  const [valor, setValor] = useState(centsToInputValue(transferencia.valor_cents));
  const [data, setData] = useState(isoParaInput(transferencia.data));
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

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
      onAtualizado({ ...transferencia, nome, valor_cents: valorCents, data });
      setErro(null);
      setEditando(false);
    });
  }

  function remover() {
    onRemovido(transferencia.id);
    const timeoutId = setTimeout(() => {
      startTransition(async () => {
        const { error } = await excluirTransferencia({
          id: transferencia.id,
          valorCents: transferencia.valor_cents,
          deContaId: transferencia.de_conta_id,
          paraContaId: transferencia.para_conta_id,
        });
        if (error) {
          onRestaurado(transferencia);
          toast(`Não foi possível excluir "${transferencia.nome}": ${error}`);
        }
      });
    }, 5000);
    toast(`"${transferencia.nome}" excluído.`, {
      actionLabel: "Desfazer",
      onAction: () => {
        clearTimeout(timeoutId);
        onRestaurado(transferencia);
      },
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
        <span className="truncate text-[0.875rem] text-ink">{transferencia.nome}</span>
        <span className="type-caption truncate text-ink-3">Transferência</span>
        <span className="type-caption truncate text-ink-3">—</span>
        <span className="type-caption truncate text-ink-2">{rota}</span>
        <span className="type-caption figures text-ink-2">{formatDataCurta(transferencia.created_at)}</span>
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
        subtitulo={`${rota} · reg. ${formatDataCurta(transferencia.created_at)} · ${formatDataCurta(transferencia.data)}`}
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
  cartoes,
  contaPorId,
  cartaoPorId,
  pessoaAtiva,
}: {
  saidasIniciais: Saida[];
  entradasIniciais: Entrada[];
  transferenciasIniciais: Transferencia[];
  categorias: Categoria[];
  contas: Conta[];
  cartoes: Pick<Cartao, "id" | "nome" | "dono">[];
  contaPorId: Map<string, string>;
  cartaoPorId: Map<string, string>;
  pessoaAtiva: Pessoa;
}) {
  const [saidas, setSaidas] = useState(saidasIniciais);
  const [entradas, setEntradas] = useState(entradasIniciais);
  const [transferencias, setTransferencias] = useState(transferenciasIniciais);
  // Ao re-buscar do servidor (pull-to-refresh / navegação), ressincroniza com a
  // verdade do servidor — as props só mudam de referência quando o RSC
  // re-renderiza, não durante as interações locais.
  useEffect(() => setSaidas(saidasIniciais), [saidasIniciais]);
  useEffect(() => setEntradas(entradasIniciais), [entradasIniciais]);
  useEffect(() => setTransferencias(transferenciasIniciais), [transferenciasIniciais]);
  const [filtros, setFiltros] = useState<Filtros>(() => filtrosPadrao(pessoaAtiva));
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ campo: "registro", direcao: "desc" });
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [catLote, setCatLote] = useState("");
  const [lotePendente, iniciarLote] = useTransition();
  const toast = useToast();
  const confirmar = useConfirm();

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

  // Opções dos filtros (categorias com dono como dica; contas e cartões juntos).
  const catOpts = useMemo(() => categorias.map((c) => ({ value: c.id, label: c.nome, hint: c.dono })), [categorias]);
  const ccOpts = useMemo(
    () => [
      ...contas.map((c) => ({ value: c.id, label: c.nome, hint: "Conta" })),
      ...cartoes.map((c) => ({ value: c.id, label: c.nome, hint: "Cartão" })),
    ],
    [contas, cartoes]
  );
  const outraPessoa: Pessoa = pessoaAtiva === "Diego" ? "Vitor" : "Diego";
  const pessoasOpts = [
    { value: pessoaAtiva, label: pessoaAtiva },
    { value: outraPessoa, label: outraPessoa },
    { value: "Casal" as const, label: "Casal" },
  ];

  const descritores: ItemDescriptor[] = useMemo(() => {
    const contasDaPessoa = (p: Pessoa) => contas.filter((c) => c.dono === p).map((c) => ({ id: c.id, nome: c.nome }));
    const sa: ItemDescriptor[] = saidas.map((s) => ({
      key: `saida-${s.id}`,
      tipo: "Saida",
      pessoa: s.pessoa,
      nome: s.nome,
      categoriaId: s.categoria_id,
      categoriaNome: categoriaPorId.get(s.categoria_id ?? "") ?? "Sem categoria",
      metodo: s.metodo,
      contaCartaoIds: [(s.metodo === "Débito" ? s.conta_id : s.cartao_id) ?? ""].filter(Boolean),
      origem: s.origem,
      statusGrupo: s.status === "Pago" ? "Pago" : "A pagar",
      vencimentoSort: s.vencimento ?? s.data ?? s.created_at,
      registroSort: s.created_at,
      valorCents: s.total_cents,
      node: (
        <SaidaRow
          key={s.id}
          saida={s}
          categorias={categorias}
          categoriaNome={categoriaPorId.get(s.categoria_id ?? "") ?? "Sem categoria"}
          destinoNome={destinoDaSaida(s)}
          onRemovido={(id) => setSaidas((prev) => prev.filter((x) => x.id !== id))}
          onRestaurado={(saida) => setSaidas((prev) => [...prev, saida])}
          onStatusAlterado={(id, novo) =>
            setSaidas((prev) => prev.map((x) => (x.id === id ? { ...x, status: novo } : x)))
          }
          onAtualizado={(atualizada) =>
            setSaidas((prev) => prev.map((x) => (x.id === atualizada.id ? atualizada : x)))
          }
        />
      ),
    }));
    const en: ItemDescriptor[] = entradas.map((e) => ({
      key: `entrada-${e.id}`,
      tipo: "Entrada",
      pessoa: e.pessoa,
      nome: e.nome,
      categoriaId: null,
      categoriaNome: "",
      metodo: null,
      contaCartaoIds: [e.conta_destino_id],
      origem: e.origem ?? "Manual",
      statusGrupo: e.status === "Recebido" ? "Recebido" : "A receber",
      vencimentoSort: e.data,
      registroSort: e.created_at,
      valorCents: e.quantia_cents,
      node: (
        <EntradaRow
          key={e.id}
          entrada={e}
          destinoNome={contaPorId.get(e.conta_destino_id) ?? "—"}
          contas={contasDaPessoa(e.pessoa)}
          onRemovido={(id) => setEntradas((prev) => prev.filter((x) => x.id !== id))}
          onRestaurado={(entrada) => setEntradas((prev) => [...prev, entrada])}
          onStatusAlterado={(id, novo) =>
            setEntradas((prev) => prev.map((x) => (x.id === id ? { ...x, status: novo } : x)))
          }
          onAtualizado={(atualizada) =>
            setEntradas((prev) => prev.map((x) => (x.id === atualizada.id ? atualizada : x)))
          }
        />
      ),
    }));
    const tr: ItemDescriptor[] = transferencias.map((t) => ({
      key: `transferencia-${t.id}`,
      tipo: "Transferencia",
      pessoa: t.pessoa,
      nome: t.nome,
      categoriaId: null,
      categoriaNome: "",
      metodo: null,
      contaCartaoIds: [t.de_conta_id, t.para_conta_id],
      origem: null,
      statusGrupo: null,
      vencimentoSort: t.data ?? t.created_at,
      registroSort: t.created_at,
      valorCents: t.valor_cents,
      node: (
        <TransferenciaRow
          key={t.id}
          transferencia={t}
          deNome={contaPorId.get(t.de_conta_id) ?? "—"}
          paraNome={contaPorId.get(t.para_conta_id) ?? "—"}
          onRemovido={(id) => setTransferencias((prev) => prev.filter((x) => x.id !== id))}
          onRestaurado={(transferencia) => setTransferencias((prev) => [...prev, transferencia])}
          onAtualizado={(atualizada) =>
            setTransferencias((prev) => prev.map((x) => (x.id === atualizada.id ? atualizada : x)))
          }
        />
      ),
    }));
    return [...sa, ...en, ...tr];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saidas, entradas, transferencias, categorias, categoriaPorId, contaPorId, cartaoPorId, contas]);

  const visiveis = useMemo(
    () => ordenar(descritores.filter((d) => passaFiltro(d, filtros)), ordenacao),
    [descritores, filtros, ordenacao]
  );

  const totalSaidas = visiveis.filter((d) => d.tipo === "Saida").reduce((s, d) => s + d.valorCents, 0);
  const totalEntradas = visiveis.filter((d) => d.tipo === "Entrada").reduce((s, d) => s + d.valorCents, 0);
  const totalTransf = visiveis.filter((d) => d.tipo === "Transferencia").reduce((s, d) => s + d.valorCents, 0);
  const temSaida = visiveis.some((d) => d.tipo === "Saida");
  const temEntrada = visiveis.some((d) => d.tipo === "Entrada");
  const temTransf = visiveis.some((d) => d.tipo === "Transferencia");

  // ---- Seleção em lote ----------------------------------------------------
  function toggleSel(key: string) {
    setSelecao((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }
  function sairSelecao() {
    setModoSelecao(false);
    setSelecao(new Set());
    setCatLote("");
  }
  const visiveisKeys = visiveis.map((d) => d.key);
  const todasSelecionadas = visiveis.length > 0 && visiveisKeys.every((k) => selecao.has(k));
  function toggleTodas() {
    setSelecao(todasSelecionadas ? new Set() : new Set(visiveisKeys));
  }

  const selecionados = visiveis.filter((d) => selecao.has(d.key));
  const idParaKey = (d: ItemDescriptor) => d.key.slice(d.key.indexOf("-") + 1);
  const idsPorTipo = (tipo: ItemDescriptor["tipo"]) =>
    selecionados.filter((d) => d.tipo === tipo).map(idParaKey);

  async function excluirSelecionados() {
    const total = selecionados.length;
    if (!total) return;
    const ok = await confirmar(`Excluir ${total} lançamento${total > 1 ? "s" : ""}? Não dá pra desfazer.`);
    if (!ok) return;
    const alvos = [...selecionados];
    iniciarLote(async () => {
      let falhas = 0;
      for (const d of alvos) {
        const id = idParaKey(d);
        let error: string | null = null;
        if (d.tipo === "Saida") {
          const s = saidas.find((x) => x.id === id);
          if (s)
            ({ error } = await excluirSaida({
              id: s.id,
              status: s.status,
              totalCents: s.total_cents,
              metodo: s.metodo,
              contaId: s.conta_id,
              cartaoId: s.cartao_id,
            }));
        } else if (d.tipo === "Entrada") {
          const e = entradas.find((x) => x.id === id);
          if (e)
            ({ error } = await excluirEntrada({
              id: e.id,
              status: e.status,
              quantiaCents: e.quantia_cents,
              contaDestinoId: e.conta_destino_id,
            }));
        } else {
          const t = transferencias.find((x) => x.id === id);
          if (t)
            ({ error } = await excluirTransferencia({
              id: t.id,
              valorCents: t.valor_cents,
              deContaId: t.de_conta_id,
              paraContaId: t.para_conta_id,
            }));
        }
        if (error) {
          falhas++;
          continue;
        }
        if (d.tipo === "Saida") setSaidas((prev) => prev.filter((x) => x.id !== id));
        else if (d.tipo === "Entrada") setEntradas((prev) => prev.filter((x) => x.id !== id));
        else setTransferencias((prev) => prev.filter((x) => x.id !== id));
      }
      sairSelecao();
      toast(falhas ? `${total - falhas} excluído(s), ${falhas} com erro.` : `${total} lançamento${total > 1 ? "s" : ""} excluído${total > 1 ? "s" : ""}.`);
    });
  }

  function liquidarSelecionados() {
    const saidaIds = idsPorTipo("Saida");
    const entradaIds = idsPorTipo("Entrada");
    if (!saidaIds.length && !entradaIds.length) {
      toast("Transferências não têm status — selecione saídas ou entradas.");
      return;
    }
    iniciarLote(async () => {
      const r1 = await marcarSaidasComoPagas(saidaIds);
      const r2 = await marcarEntradasComoRecebidas(entradaIds);
      if (r1.error || r2.error) {
        toast(`Erro ao liquidar: ${r1.error ?? r2.error}`);
        return;
      }
      setSaidas((prev) => prev.map((s) => (saidaIds.includes(s.id) && s.status !== "Pago" ? { ...s, status: "Pago" } : s)));
      setEntradas((prev) =>
        prev.map((e) => (entradaIds.includes(e.id) && e.status !== "Recebido" ? { ...e, status: "Recebido" } : e))
      );
      sairSelecao();
      toast(`${r1.feitas + r2.feitas} marcado(s) como pago/recebido.`);
    });
  }

  function aplicarCategoria(categoriaId: string) {
    const saidaIds = idsPorTipo("Saida");
    if (!saidaIds.length) {
      toast("Categoria só se aplica a saídas.");
      return;
    }
    iniciarLote(async () => {
      const { error } = await definirCategoriaEmLote(saidaIds, categoriaId || null);
      if (error) {
        toast(`Erro ao trocar categoria: ${error}`);
        return;
      }
      setSaidas((prev) => prev.map((s) => (saidaIds.includes(s.id) ? { ...s, categoria_id: categoriaId || null } : s)));
      sairSelecao();
      toast(`Categoria aplicada a ${saidaIds.length} saída${saidaIds.length > 1 ? "s" : ""}.`);
    });
  }

  return (
    <>
      <FiltrosBar
        filtros={filtros}
        onChange={setFiltros}
        ordenacao={ordenacao}
        onOrdenar={setOrdenacao}
        categorias={catOpts}
        contasCartoes={ccOpts}
        pessoas={pessoasOpts}
        modoSelecao={modoSelecao}
        onToggleSelecao={() => (modoSelecao ? sairSelecao() : setModoSelecao(true))}
        mostrarSelecao
        totalVisivel={visiveis.length}
      />

      {modoSelecao && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-raised p-2 shadow-raised">
          <span className="type-label px-1.5 text-ink">
            {selecionados.length} selecionado{selecionados.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={liquidarSelecionados}
            disabled={lotePendente || selecionados.length === 0}
            className="type-label flex items-center gap-1.5 rounded-sm bg-brand-tint px-3 py-1.5 font-medium text-on-brand-tint transition-colors hover:brightness-97 disabled:opacity-40"
          >
            <CheckCheck size={15} />
            Marcar pago/recebido
          </button>
          <div className="w-52">
            <Combobox
              options={catOpts}
              value={catLote}
              onChange={aplicarCategoria}
              placeholder="Trocar categoria"
              searchPlaceholder="Buscar categoria"
            />
          </div>
          <button
            type="button"
            onClick={excluirSelecionados}
            disabled={lotePendente || selecionados.length === 0}
            className="type-label flex items-center gap-1.5 rounded-sm bg-neg-tint px-3 py-1.5 font-medium text-on-neg-tint transition-colors hover:brightness-97 disabled:opacity-40"
          >
            <Trash2 size={15} />
            Excluir
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={sairSelecao}
            className="type-label flex items-center gap-1 rounded-sm px-2.5 py-1.5 text-ink-2 transition-colors hover:bg-bg hover:text-ink"
          >
            <X size={15} />
            Concluir
          </button>
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="rounded-md border border-hairline bg-surface p-8 text-center">
          <p className="type-body text-ink-2">Nenhum lançamento com os filtros atuais.</p>
        </div>
      ) : (
        <div className="rounded-md border border-hairline bg-surface">
          <div className="hidden items-stretch border-b border-hairline xl:flex">
            {modoSelecao && (
              <label className="flex w-11 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={todasSelecionadas}
                  onChange={toggleTodas}
                  aria-label="Selecionar todos"
                  className="accent-brand"
                />
              </label>
            )}
            <div className={`${ROW_GRID} flex-1 px-3 py-2.5`}>
            <span />
            <CabecalhoOrdenavel label="Nome" campo="nome" ordenacao={ordenacao} onClick={() => alternarOrdenacao("nome")} />
            <CabecalhoOrdenavel
              label="Categoria"
              campo="categoria"
              ordenacao={ordenacao}
              onClick={() => alternarOrdenacao("categoria")}
            />
            <span className="type-eyebrow text-ink-3">Método</span>
            <span className="type-eyebrow text-ink-3">Conta / Cartão</span>
            <CabecalhoOrdenavel
              label="Registro"
              campo="registro"
              ordenacao={ordenacao}
              onClick={() => alternarOrdenacao("registro")}
            />
            <CabecalhoOrdenavel
              label="Venc."
              campo="vencimento"
              ordenacao={ordenacao}
              onClick={() => alternarOrdenacao("vencimento")}
            />
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
          </div>

          {visiveis.map((item) => (
            <div key={item.key} className="flex items-stretch">
              {modoSelecao && (
                <label className="flex w-11 shrink-0 items-center justify-center border-b border-hairline">
                  <input
                    type="checkbox"
                    checked={selecao.has(item.key)}
                    onChange={() => toggleSel(item.key)}
                    aria-label="Selecionar lançamento"
                    className="accent-brand"
                  />
                </label>
              )}
              <div className="min-w-0 flex-1">{item.node}</div>
            </div>
          ))}

          {/* Fecho contábil: régua dupla e totais do recorte filtrado. */}
          <div className="rule-ledger" aria-hidden="true" />
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-3 py-3">
            <p className="type-caption text-ink-3">
              {visiveis.length} {visiveis.length === 1 ? "lançamento" : "lançamentos"}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              {temSaida && (
                <p className="type-label text-ink-2">
                  Saídas <span className="figures font-semibold text-ink">{formatCentsToBRL(totalSaidas)}</span>
                </p>
              )}
              {temEntrada && (
                <p className="type-label text-ink-2">
                  Entradas <span className="figures font-semibold text-pos">{formatCentsToBRL(totalEntradas)}</span>
                </p>
              )}
              {temSaida && temEntrada && (
                <p className="type-label text-ink-2">
                  Resultado{" "}
                  <Amount cents={totalEntradas - totalSaidas} semantic="both" className="type-label font-semibold" />
                </p>
              )}
              {temTransf && (
                <p className="type-label text-ink-3">
                  Transferido <span className="figures font-semibold text-ink-2">{formatCentsToBRL(totalTransf)}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
