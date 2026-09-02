"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, ChevronDown, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Amount } from "@/components/ui/amount";
import { PersonDot } from "@/components/ui/person-tag";
import { SortMenu } from "@/components/ui/sort-menu";
import { EditarSaidaForm } from "@/components/saida/editar-saida-form";
import { instantToCalendarDate, type CalendarDate } from "@/lib/domain/calendar-date";
import { dataParaCalculo } from "@/lib/domain/data-fallback";
import {
  isSaidaFutura,
  ORDENACAO_FEED_PADRAO,
  ordenarFeed,
  totalCentsDoFeed,
  type CampoOrdenacaoFeed,
  type OrdenacaoFeed,
  type ResumoLancamento,
} from "@/lib/domain/feed-saidas";
import { formatCentsToBRL } from "@/lib/domain/money";
import { nomeComParcela } from "@/lib/domain/parcelamento";
import { labelMes, MESES_ABREV } from "@/lib/format/meses";
import type { Categoria, Pessoa, Saida } from "@/lib/domain/types";

type Filtro = "Geral" | Pessoa;

const PAGINA = 12;

const CAMPOS: { value: CampoOrdenacaoFeed; label: string }[] = [
  { value: "registro", label: "Registro" },
  { value: "data", label: "Data da compra" },
  { value: "valor", label: "Valor" },
  { value: "categoria", label: "Categoria" },
  { value: "nome", label: "Nome" },
];

/* Uma grade só para cabeçalho e linhas, para as colunas alinharem no mesmo
 * eixo: pessoa · saída · categoria · registro · data · status · valor · seta.
 * Só a partir de xl (1280px): abaixo disso, com a sidebar de 256px, as
 * colunas fixas não cabem — a linha vira duas faixas (nome+valor / detalhes),
 * mesmo critério da tabela de Lançamentos. */
const GRID =
  "xl:grid xl:grid-cols-[14px_minmax(0,1fr)_minmax(0,9rem)_5.5rem_5.5rem_5.5rem_6.5rem_1rem] xl:items-center xl:gap-3";

function ddmm(d: CalendarDate): string {
  return `${String(d.day).padStart(2, "0")}/${String(d.month).padStart(2, "0")}`;
}

function ddmmaaaa(d: CalendarDate): string {
  return `${ddmm(d)}/${d.year}`;
}

function mesAbrev(d: CalendarDate): string {
  return `${MESES_ABREV[d.month - 1]}/${d.year}`;
}

function descricaoResumo(resumo: ResumoLancamento | undefined): string | null {
  if (!resumo) return null;
  if (resumo.tipo === "parcelado") return `${resumo.parcelas}x · total ${formatCentsToBRL(resumo.totalCents)}`;
  return resumo.ocorrencias > 1 ? `recorrente até ${mesAbrev(resumo.ultimaData)}` : "recorrente";
}

/** Selo de status: pago em verde-tinta, a pagar em âmbar-tinta; compra com
 * data futura (ocorrência de recorrência/parcela) aparece como agendada. */
function StatusTag({ saida, hoje }: { saida: Saida; hoje: CalendarDate }) {
  const pago = saida.status === "Pago";
  const label = !pago && isSaidaFutura(saida, hoje) ? "Agendada" : saida.status;
  return (
    <span
      className={`type-caption inline-block max-w-full truncate rounded-xs px-1.5 py-0.5 font-medium ${
        pago ? "bg-brand-tint text-on-brand-tint" : "bg-warn-tint text-warn"
      }`}
    >
      {label}
    </span>
  );
}

/** Categoria como selo clicável: filtra a lista pela categoria. */
function CategoriaTag({ nome, ativa, onClick }: { nome: string; ativa: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={ativa}
      title={ativa ? "Limpar filtro de categoria" : `Filtrar por ${nome}`}
      className={`type-caption inline-block max-w-[8.5rem] truncate rounded-xs px-1.5 py-0.5 font-medium transition-colors xl:max-w-full ${
        ativa ? "bg-chip-ink text-on-chip-ink" : "bg-track text-ink-2 hover:text-ink"
      }`}
    >
      {nome}
    </button>
  );
}

function Cabecalho({
  label,
  campo,
  ordenacao,
  onOrdenar,
  align = "left",
}: {
  label: string;
  campo?: CampoOrdenacaoFeed;
  ordenacao: OrdenacaoFeed;
  onOrdenar: (campo: CampoOrdenacaoFeed) => void;
  align?: "left" | "right";
}) {
  if (!campo) {
    return <span className={`type-eyebrow text-ink-3 ${align === "right" ? "text-right" : ""}`}>{label}</span>;
  }
  const ativo = ordenacao.campo === campo;
  const Icone = ativo ? (ordenacao.direcao === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onOrdenar(campo)}
      className={`type-eyebrow flex min-w-0 items-center gap-1 text-ink-3 transition-colors hover:text-ink-2 ${
        align === "right" ? "justify-end" : ""
      }`}
    >
      <span className="truncate">{label}</span>
      <Icone size={11} className={`shrink-0 ${ativo ? "text-brand" : "text-ink-3"}`} />
    </button>
  );
}

const ROTULO_PADRAO = { singular: "saída", plural: "saídas", evento: "compra" };

/**
 * Feed mensal de saídas com filtro por pessoa e categoria, ordenação e edição
 * inline. Serve tanto para "Últimas saídas" (avulsas) quanto para o box de
 * "Contas fixas" do Painel — o chamador decide o recorte e os rótulos.
 */
export function UltimasSaidas({
  saidas,
  resumos,
  categorias,
  contaPorId,
  cartaoPorId,
  mesReferencia,
  hoje,
  pessoaAtiva,
  verTudoHref,
  rotulo = ROTULO_PADRAO,
  vazio = "Nenhuma saída com data neste mês. Registre a primeira em Lançar.",
  ordenacaoInicial = ORDENACAO_FEED_PADRAO,
}: {
  /** Saídas com data da compra no mês em foco (recorte feito no servidor). */
  saidas: Saida[];
  /** id → resumo do parcelamento/recorrência de origem, quando houver. */
  resumos: Record<string, ResumoLancamento>;
  categorias: Categoria[];
  contaPorId: Map<string, string>;
  cartaoPorId: Map<string, string>;
  mesReferencia: CalendarDate;
  hoje: CalendarDate;
  pessoaAtiva: Pessoa;
  /** Destino do "Ver tudo" (Lançamentos ou Contas fixas do mês). */
  verTudoHref: string;
  /** Como chamar os itens na linha-resumo ("3 contas fixas com cobrança em…"). */
  rotulo?: { singular: string; plural: string; evento: string };
  vazio?: string;
  ordenacaoInicial?: OrdenacaoFeed;
}) {
  const router = useRouter();
  // Começa no perfil ativo — Geral é uma visão opcional.
  const [filtro, setFiltro] = useState<Filtro>(pessoaAtiva);
  const [ordenacao, setOrdenacao] = useState<OrdenacaoFeed>(ordenacaoInicial);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [limite, setLimite] = useState(PAGINA);
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const outraPessoa: Pessoa = pessoaAtiva === "Diego" ? "Vitor" : "Diego";
  const FILTROS: Filtro[] = [pessoaAtiva, outraPessoa, "Geral"];

  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);
  const nomeCategoria = (id: string | null) => (id && categoriaPorId.get(id)) ?? "Sem categoria";

  function destino(s: Saida): string {
    const id = s.metodo === "Débito" ? s.conta_id : s.cartao_id;
    return (id && (s.metodo === "Débito" ? contaPorId.get(id) : cartaoPorId.get(id))) ?? "—";
  }

  const porPessoa = useMemo(
    () => (filtro === "Geral" ? saidas : saidas.filter((s) => s.pessoa === filtro)),
    [saidas, filtro]
  );
  const filtradas = useMemo(
    () => (categoriaFiltro ? porPessoa.filter((s) => (s.categoria_id ?? "") === categoriaFiltro) : porPessoa),
    [porPessoa, categoriaFiltro]
  );
  const ordenadas = useMemo(() => ordenarFeed(filtradas, ordenacao, nomeCategoria), [filtradas, ordenacao, categoriaPorId]); // eslint-disable-line react-hooks/exhaustive-deps
  const exibidas = ordenadas.slice(0, limite);
  const total = totalCentsDoFeed(filtradas);

  function ordenarPor(campo: CampoOrdenacaoFeed) {
    setOrdenacao((o) => ({
      campo,
      direcao: o.campo === campo ? (o.direcao === "asc" ? "desc" : "asc") : "desc",
    }));
  }

  function alternarCategoria(id: string) {
    setCategoriaFiltro((atual) => (atual === id ? null : id));
    setLimite(PAGINA);
  }

  function mudarFiltro(f: Filtro) {
    setFiltro(f);
    setLimite(PAGINA);
  }

  function aoMudar() {
    setAbertaId(null);
    router.refresh();
  }

  const restantes = ordenadas.length - exibidas.length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <Chip key={f} label={f} selected={filtro === f} onClick={() => mudarFiltro(f)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SortMenu opcoes={CAMPOS} ordenacao={ordenacao} onOrdenar={setOrdenacao} size="sm" />
          <Link href={verTudoHref} className="type-caption ml-1 flex items-center gap-1 text-ink-2 hover:text-ink">
            Ver tudo <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {/* Leitura rápida do recorte: quantas, quanto, e o filtro de categoria ativo. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="type-caption text-ink-3">
          {filtradas.length === 0
            ? `Nenhuma ${rotulo.singular} com ${rotulo.evento} em ${labelMes(mesReferencia)}`
            : `${filtradas.length} ${filtradas.length === 1 ? rotulo.singular : rotulo.plural} com ${rotulo.evento} em ${labelMes(mesReferencia)}`}
          {filtradas.length > 0 && (
            <>
              {" · "}
              <span className="figures text-ink-2">{formatCentsToBRL(total)}</span>
            </>
          )}
        </p>
        {categoriaFiltro !== null && (
          <button
            type="button"
            onClick={() => setCategoriaFiltro(null)}
            className="type-caption inline-flex items-center gap-1 rounded-full bg-chip-ink py-0.5 pl-2.5 pr-1.5 font-medium text-on-chip-ink"
          >
            {nomeCategoria(categoriaFiltro || null)}
            <X size={12} />
          </button>
        )}
      </div>

      {exibidas.length === 0 ? (
        <p className="type-body py-6 text-center text-ink-2">
          {saidas.length === 0 ? vazio : `Nenhuma ${rotulo.singular} neste recorte.`}
        </p>
      ) : (
        <div className="flex flex-col">
          <div className={`hidden border-b border-hairline pb-2 ${GRID}`}>
            <span />
            <Cabecalho label={rotulo.singular === "saída" ? "Saída" : "Conta"} campo="nome" ordenacao={ordenacao} onOrdenar={ordenarPor} />
            <Cabecalho label="Categoria" campo="categoria" ordenacao={ordenacao} onOrdenar={ordenarPor} />
            <Cabecalho label="Registro" campo="registro" ordenacao={ordenacao} onOrdenar={ordenarPor} />
            <Cabecalho label={rotulo.evento === "compra" ? "Compra" : "Cobrança"} campo="data" ordenacao={ordenacao} onOrdenar={ordenarPor} />
            <Cabecalho label="Status" ordenacao={ordenacao} onOrdenar={ordenarPor} />
            <Cabecalho label="Valor" campo="valor" ordenacao={ordenacao} onOrdenar={ordenarPor} align="right" />
            <span />
          </div>

          <ul className="flex flex-col divide-y divide-hairline">
            {exibidas.map((s) => {
              const aberta = abertaId === s.id;
              const registro = instantToCalendarDate(s.created_at);
              const compra = dataParaCalculo(s);
              const categoriaNome = nomeCategoria(s.categoria_id);
              const resumo = descricaoResumo(resumos[s.id]);
              const vence =
                s.metodo === "Crédito" && s.vencimento ? `vence ${s.vencimento.slice(8, 10)}/${s.vencimento.slice(5, 7)}` : null;
              const detalhes = [s.metodo, destino(s), vence, resumo].filter(Boolean).join(" · ");

              return (
                <li key={s.id} className="py-1.5">
                  <div
                    onClick={() => setAbertaId(aberta ? null : s.id)}
                    className={`cursor-pointer rounded-sm py-1.5 transition-colors hover:bg-bg ${GRID} flex flex-col gap-1.5`}
                  >
                    {/* Mobile: nome + valor na 1ª linha; desktop: célula da saída. */}
                    <div className="hidden xl:block">
                      <PersonDot pessoa={s.pessoa} />
                    </div>
                    <div className="flex min-w-0 items-start gap-2.5 xl:block">
                      <PersonDot pessoa={s.pessoa} className="mt-2 xl:hidden" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.875rem] text-ink">{nomeComParcela(s.nome, s.parcela)}</p>
                        <p className="type-caption truncate text-ink-3">{detalhes}</p>
                      </div>
                      {/* Mobile: valor e status encostados à direita, nas mesmas
                          duas linhas do nome e do detalhe. */}
                      <div className="flex shrink-0 flex-col items-end gap-1 xl:hidden">
                        <Amount cents={s.total_cents} semantic="none" className="text-[0.875rem] text-ink" />
                        <StatusTag saida={s} hoje={hoje} />
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-4 xl:contents">
                      <div className="min-w-0 xl:flex xl:items-center">
                        <CategoriaTag
                          nome={categoriaNome}
                          ativa={categoriaFiltro === (s.categoria_id ?? "")}
                          onClick={() => alternarCategoria(s.categoria_id ?? "")}
                        />
                      </div>
                      <span
                        className="type-caption figures text-ink-3"
                        title={`Registrada em ${ddmmaaaa(registro)}`}
                      >
                        <span className="xl:hidden">reg. </span>
                        {ddmm(registro)}
                      </span>
                      <span className="type-caption figures text-ink-3" title={`${rotulo.evento === "compra" ? "Compra" : "Cobrança"} em ${ddmmaaaa(compra)}`}>
                        <span className="xl:hidden">{rotulo.evento} </span>
                        {ddmm(compra)}
                      </span>
                      <div className="hidden min-w-0 xl:flex xl:items-center">
                        <StatusTag saida={s} hoje={hoje} />
                      </div>
                      <Amount
                        cents={s.total_cents}
                        semantic="none"
                        className="hidden text-right text-[0.875rem] text-ink xl:block"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAbertaId(aberta ? null : s.id);
                        }}
                        aria-expanded={aberta}
                        aria-label={aberta ? "Fechar edição" : "Editar saída"}
                        className="ml-auto flex h-5 w-5 items-center justify-center text-ink-3 xl:ml-0"
                      >
                        <ChevronDown size={15} className={`transition-transform ${aberta ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                  {aberta && (
                    <div className="pb-2 pt-1">
                      <EditarSaidaForm
                        saida={s}
                        categorias={categorias}
                        destinoNome={destino(s)}
                        onSalvo={aoMudar}
                        onExcluido={aoMudar}
                        onCancelar={() => setAbertaId(null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {restantes > 0 && (
            <button
              type="button"
              onClick={() => setLimite((l) => l + PAGINA)}
              className="type-label mt-3 self-center rounded-sm border border-hairline-strong bg-surface px-3 py-1.5 text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
            >
              Mostrar mais {Math.min(PAGINA, restantes)} de {restantes}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
