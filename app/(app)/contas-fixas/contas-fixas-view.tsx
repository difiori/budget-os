"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Ban, CreditCard, Pencil, Plus, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { Combobox } from "@/components/ui/combobox";
import { Field, inputClasses } from "@/components/ui/field";
import { PersonDot } from "@/components/ui/person-tag";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { alternarStatusSaida, atualizarSaida } from "@/app/(app)/lancamentos/actions";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { addMonths, parseCalendarDate, type CalendarDate } from "@/lib/domain/calendar-date";
import { diasAte, ocorrenciaDoMes, ocorrenciaPrevista, vigenteNoMes } from "@/lib/domain/conta-fixa";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import { labelMes, MESES, MESES_ABREV } from "@/lib/format/meses";
import type { Cartao, Categoria, Conta, ContaFixa, MetodoPagamento, Pessoa, Saida } from "@/lib/domain/types";
import {
  atualizarContaFixa,
  criarContaFixa,
  encerrarContaFixa,
  excluirContaFixa,
  reativarContaFixa,
  type ContaFixaInput,
} from "./actions";

type Filtro = Pessoa | "Casal";
type ContaRef = Pick<Conta, "id" | "nome" | "dono">;
type CartaoRef = Pick<Cartao, "id" | "nome" | "dono" | "dia_vencimento">;

function mesAbrev(iso: string): string {
  const d = parseCalendarDate(iso);
  return `${MESES_ABREV[d.month - 1]}/${String(d.year).slice(2)}`;
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/* ------------------------------------------------------------------------ */
/* Formulário de contrato (criar / editar)                                    */
/* ------------------------------------------------------------------------ */

type Aplicacao = "nao" | "este" | "proximo";

function ContaFixaForm({
  inicial,
  ocorrenciaDoMes = null,
  categorias,
  contas,
  cartoes,
  pessoaPadrao,
  mesReferencia,
  onSalvar,
  onCancelar,
  salvando,
}: {
  inicial: ContaFixa | null;
  /** Ocorrência do mês em foco (edição): decide o padrão de "a partir de quando". */
  ocorrenciaDoMes?: Saida | null;
  categorias: Categoria[];
  contas: ContaRef[];
  cartoes: CartaoRef[];
  pessoaPadrao: Pessoa;
  mesReferencia: CalendarDate;
  onSalvar: (input: ContaFixaInput, aplicacao: Aplicacao) => void;
  onCancelar: () => void;
  salvando: boolean;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [pessoa, setPessoa] = useState<Pessoa>(inicial?.pessoa ?? pessoaPadrao);
  const [metodo, setMetodo] = useState<MetodoPagamento>(inicial?.metodo ?? "Débito");
  const [destinoId, setDestinoId] = useState(inicial ? (inicial.metodo === "Débito" ? inicial.conta_id : inicial.cartao_id) ?? "" : "");
  const [categoriaId, setCategoriaId] = useState(inicial?.categoria_id ?? "");
  const [valor, setValor] = useState(inicial ? centsToInput(inicial.total_cents) : "");
  const [dia, setDia] = useState(String(inicial?.dia_vencimento ?? 5));
  const [inicio, setInicio] = useState(
    inicial ? inicial.inicio.slice(0, 7) : `${mesReferencia.year}-${String(mesReferencia.month).padStart(2, "0")}`
  );
  // Se o valor deste mês já foi ajustado à mão (difere do previsto), o padrão
  // é aplicar só a partir do próximo mês — senão o valor real seria apagado.
  const mesJaAjustado = !!inicial && !!ocorrenciaDoMes && ocorrenciaDoMes.total_cents !== inicial.total_cents;
  const [aplicacao, setAplicacao] = useState<Aplicacao>(mesJaAjustado ? "proximo" : "este");
  const [erro, setErro] = useState<string | null>(null);

  const destinos = (metodo === "Débito" ? contas : cartoes).filter((d) => d.dono === pessoa);
  const cats = categoriasParaPessoa(categorias, pessoa);

  function trocarPessoa(p: Pessoa) {
    setPessoa(p);
    setDestinoId("");
    setCategoriaId("");
  }
  function trocarMetodo(m: MetodoPagamento) {
    setMetodo(m);
    setDestinoId("");
  }

  function salvar() {
    let cents: number;
    try {
      cents = parseCentsFromBRL(valor);
    } catch {
      setErro("Valor inválido.");
      return;
    }
    const [ano, mes] = inicio.split("-").map(Number);
    if (!ano || !mes) {
      setErro("Informe o mês de início.");
      return;
    }
    setErro(null);
    onSalvar(
      {
        nome,
        totalCents: cents,
        pessoa,
        metodo,
        categoriaId: categoriaId || null,
        contaId: metodo === "Débito" ? destinoId || null : null,
        cartaoId: metodo === "Crédito" ? destinoId || null : null,
        diaVencimento: Number(dia),
        inicio: { year: ano, month: mes },
      },
      aplicacao
    );
  }

  return (
    <Card className="flex flex-col gap-4 bg-bg">
      <p className="type-title text-ink">{inicial ? `Editar ${inicial.nome}` : "Nova conta fixa"}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Condomínio" className={inputClasses} />
        </Field>
        <Field label="Pessoa">
          <div className="flex gap-1.5">
            {(["Diego", "Vitor"] as Pessoa[]).map((p) => (
              <Chip key={p} label={p} selected={pessoa === p} onClick={() => trocarPessoa(p)} />
            ))}
          </div>
        </Field>
        <Field label="Método">
          <div className="flex gap-1.5">
            {(["Débito", "Crédito"] as MetodoPagamento[]).map((m) => (
              <Chip key={m} label={m} selected={metodo === m} onClick={() => trocarMetodo(m)} />
            ))}
          </div>
        </Field>
        <Field label={metodo === "Débito" ? "Conta" : "Cartão"}>
          <Combobox
            options={destinos.map((d) => ({ value: d.id, label: d.nome }))}
            value={destinoId}
            onChange={setDestinoId}
            placeholder={metodo === "Débito" ? "Selecionar conta" : "Selecionar cartão"}
          />
        </Field>
        <Field label="Categoria">
          <Combobox
            options={cats.map((c) => ({ value: c.id, label: c.nome }))}
            value={categoriaId}
            onChange={setCategoriaId}
            placeholder="Selecionar categoria"
            searchPlaceholder="Buscar categoria"
            clearable
          />
        </Field>
        <Field label="Valor previsto">
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={`figures ${inputClasses}`} />
        </Field>
        <Field label={metodo === "Débito" ? "Dia do vencimento" : "Dia da cobrança no cartão"} hint={metodo === "Crédito" ? "A fatura vence dia 10 do mês seguinte." : undefined}>
          <input type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} className={`figures ${inputClasses}`} />
        </Field>
        <Field label="Começa em" hint="Meses anteriores não são gerados.">
          <input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputClasses} />
        </Field>
      </div>

      {inicial && (
        <Field
          label="Aplicar às ocorrências ainda não pagas"
          hint={
            aplicacao === "nao"
              ? "Só o contrato muda; os meses já gerados ficam como estão."
              : aplicacao === "este"
                ? `${labelMes(mesReferencia)} em diante recebem o novo valor, dia e destino. As pagas não mudam.`
                : `${labelMes(mesReferencia)} fica como está${mesJaAjustado && ocorrenciaDoMes ? ` (${formatCentsToBRL(ocorrenciaDoMes.total_cents)}, já ajustado)` : ""}; muda de ${labelMes(addMonths(mesReferencia, 1))} em diante.`
          }
        >
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Não" selected={aplicacao === "nao"} onClick={() => setAplicacao("nao")} />
            <Chip label="A partir deste mês" selected={aplicacao === "este"} onClick={() => setAplicacao("este")} />
            <Chip label="A partir do próximo mês" selected={aplicacao === "proximo"} onClick={() => setAplicacao("proximo")} />
          </div>
        </Field>
      )}

      {erro && <p className="type-caption text-neg">{erro}</p>}

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={salvar} disabled={salvando} className="px-4 py-1.5">
          {salvando ? "Salvando..." : inicial ? "Salvar" : "Criar conta fixa"}
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={salvando} className="px-4 py-1.5">
          Cancelar
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Tela                                                                       */
/* ------------------------------------------------------------------------ */

export function ContasFixasView({
  contratos,
  ocorrenciasIniciais,
  categorias,
  contas,
  cartoes,
  pessoaAtiva,
  mesReferencia,
  hoje,
}: {
  contratos: ContaFixa[];
  ocorrenciasIniciais: Saida[];
  categorias: Categoria[];
  contas: ContaRef[];
  cartoes: CartaoRef[];
  pessoaAtiva: Pessoa;
  mesReferencia: CalendarDate;
  hoje: CalendarDate;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmar = useConfirm();
  const [, startTransition] = useTransition();
  const [salvando, setSalvando] = useState(false);

  const [filtro, setFiltro] = useState<Filtro>(pessoaAtiva);
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false);
  const [criando, setCriando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [ocorrencias, setOcorrencias] = useState(ocorrenciasIniciais);
  const [valorEditandoId, setValorEditandoId] = useState<string | null>(null);
  const [valorRascunho, setValorRascunho] = useState("");

  const outraPessoa: Pessoa = pessoaAtiva === "Diego" ? "Vitor" : "Diego";
  const categoriaNome = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);
  const contaNome = useMemo(() => new Map(contas.map((c) => [c.id, c.nome])), [contas]);
  const cartaoNome = useMemo(() => new Map(cartoes.map((c) => [c.id, c.nome])), [cartoes]);

  const destino = (cf: Pick<ContaFixa, "metodo" | "conta_id" | "cartao_id">) =>
    (cf.metodo === "Débito" ? contaNome.get(cf.conta_id ?? "") : cartaoNome.get(cf.cartao_id ?? "")) ?? "—";

  const doFiltro = contratos.filter((cf) => filtro === "Casal" || cf.pessoa === filtro);
  const vigentes = doFiltro.filter((cf) => vigenteNoMes(cf, mesReferencia));
  const foraDeVigencia = doFiltro.filter((cf) => !vigenteNoMes(cf, mesReferencia));

  const valorDoMes = (cf: ContaFixa) => ocorrenciaDoMes(ocorrencias, cf.id, mesReferencia)?.total_cents ?? cf.total_cents;

  // Débito e cartão são coisas diferentes: débito sai da conta item a item;
  // assinatura no cartão entra na fatura e é paga junto com ela, em Cartões.
  const debito = vigentes.filter((cf) => cf.metodo === "Débito");
  const credito = vigentes.filter((cf) => cf.metodo === "Crédito");

  function agrupar(lista: ContaFixa[], chave: (cf: ContaFixa) => string) {
    const mapa = new Map<string, ContaFixa[]>();
    for (const cf of lista) mapa.set(chave(cf), [...(mapa.get(chave(cf)) ?? []), cf]);
    return [...mapa.entries()]
      .map(([nome, itens]) => ({
        nome,
        itens: [...itens].sort((a, b) => a.dia_vencimento - b.dia_vencimento || a.nome.localeCompare(b.nome, "pt-BR")),
        total: itens.reduce((sum, cf) => sum + valorDoMes(cf), 0),
      }))
      .sort((a, b) => b.total - a.total);
  }
  // Débito por categoria; cartão por cartão (cada grupo é um pedaço da fatura).
  const gruposDebito = agrupar(debito, (cf) => categoriaNome.get(cf.categoria_id ?? "") ?? "Sem categoria");
  const gruposCredito = agrupar(credito, (cf) => cartaoNome.get(cf.cartao_id ?? "") ?? "Cartão");

  const mesSeguinte = addMonths(mesReferencia, 1);
  const dd = (n: number) => String(n).padStart(2, "0");
  function rotuloFatura(nomeCartao: string): string {
    const cartao = cartoes.find((c) => c.nome === nomeCartao);
    const dia = cartao?.dia_vencimento ?? 10;
    return `Fatura de ${MESES[mesReferencia.month - 1].toLowerCase()} · vence ${dd(dia)}/${dd(mesSeguinte.month)}`;
  }

  // Resumo do mês: pagamento e urgência só fazem sentido no débito.
  const resumo = (() => {
    let debitoTotal = 0;
    let debitoPago = 0;
    let proximos = 0;
    let atrasadas = 0;
    for (const cf of debito) {
      const oc = ocorrenciaDoMes(ocorrencias, cf.id, mesReferencia);
      const valor = oc?.total_cents ?? cf.total_cents;
      debitoTotal += valor;
      if (oc?.status === "Pago") {
        debitoPago += valor;
        continue;
      }
      const dias = diasAte(oc?.data ?? ocorrenciaPrevista(cf, mesReferencia).data, hoje);
      if (dias < 0) atrasadas += 1;
      else if (dias <= 7) proximos += 1;
    }
    const creditoTotal = credito.reduce((sum, cf) => sum + valorDoMes(cf), 0);
    return {
      debitoTotal,
      debitoPago,
      debitoFalta: debitoTotal - debitoPago,
      creditoTotal,
      total: debitoTotal + creditoTotal,
      proximos,
      atrasadas,
    };
  })();

  function atualizar() {
    startTransition(() => router.refresh());
  }

  function alternarPago(oc: Saida) {
    const novo = oc.status === "Pago" ? "A pagar" : "Pago";
    setOcorrencias((prev) => prev.map((s) => (s.id === oc.id ? { ...s, status: novo } : s)));
    startTransition(async () => {
      const { error } = await alternarStatusSaida(oc.id);
      if (error) {
        setOcorrencias((prev) => prev.map((s) => (s.id === oc.id ? { ...s, status: oc.status } : s)));
        toast(error);
      }
    });
  }

  function iniciarEdicaoValor(oc: Saida) {
    setValorEditandoId(oc.id);
    setValorRascunho(centsToInput(oc.total_cents));
  }

  function salvarValor(oc: Saida) {
    let cents: number;
    try {
      cents = parseCentsFromBRL(valorRascunho);
    } catch {
      toast("Valor inválido.");
      return;
    }
    setValorEditandoId(null);
    if (cents === oc.total_cents) return;
    setOcorrencias((prev) => prev.map((s) => (s.id === oc.id ? { ...s, total_cents: cents } : s)));
    startTransition(async () => {
      const { error } = await atualizarSaida({
        id: oc.id,
        nome: oc.nome,
        totalCents: cents,
        data: oc.data ?? "",
        vencimento: oc.vencimento ?? "",
        parcela: oc.parcela,
        categoriaId: oc.categoria_id,
        status: oc.status,
        statusAnterior: oc.status,
        totalCentsAnterior: oc.total_cents,
        metodo: oc.metodo,
        contaId: oc.conta_id,
        cartaoId: oc.cartao_id,
      });
      if (error) {
        setOcorrencias((prev) => prev.map((s) => (s.id === oc.id ? { ...s, total_cents: oc.total_cents } : s)));
        toast(error);
      }
    });
  }

  function criar(input: ContaFixaInput) {
    setSalvando(true);
    startTransition(async () => {
      const { error } = await criarContaFixa(input, mesReferencia);
      setSalvando(false);
      if (error) {
        toast(error);
        return;
      }
      setCriando(false);
      toast(`"${input.nome}" criada.`);
      atualizar();
    });
  }

  function editar(id: string, input: ContaFixaInput, aplicacao: Aplicacao) {
    setSalvando(true);
    startTransition(async () => {
      const { error } = await atualizarContaFixa(id, input, {
        aplicarFuturas: aplicacao !== "nao",
        aPartirDe: aplicacao === "proximo" ? addMonths(mesReferencia, 1) : mesReferencia,
      });
      setSalvando(false);
      if (error) {
        toast(error);
        return;
      }
      setEditandoId(null);
      toast(`"${input.nome}" atualizada.`);
      atualizar();
    });
  }

  async function encerrar(cf: ContaFixa) {
    const proximo = addMonths(mesReferencia, 1);
    const ok = await confirmar(
      `Encerrar "${cf.nome}" depois de ${labelMes(mesReferencia)}? Nada mais é gerado a partir de ${labelMes(proximo)}, e as ocorrências futuras ainda não pagas são removidas.`
    );
    if (!ok) return;
    startTransition(async () => {
      const { error, removidas } = await encerrarContaFixa(cf.id, mesReferencia);
      if (error) {
        toast(error);
        return;
      }
      toast(removidas > 0 ? `"${cf.nome}" encerrada · ${removidas} ocorrência(s) futura(s) removida(s).` : `"${cf.nome}" encerrada.`);
      atualizar();
    });
  }

  function reativar(cf: ContaFixa) {
    startTransition(async () => {
      const { error } = await reativarContaFixa(cf.id, mesReferencia);
      if (error) toast(error);
      else {
        toast(`"${cf.nome}" reativada.`);
        atualizar();
      }
    });
  }

  async function excluir(cf: ContaFixa) {
    const ok = await confirmar(`Excluir "${cf.nome}"? Só é possível sem lançamentos vinculados.`);
    if (!ok) return;
    startTransition(async () => {
      const { error } = await excluirContaFixa(cf.id);
      if (error) toast(error);
      else {
        toast(`"${cf.nome}" excluída.`);
        atualizar();
      }
    });
  }

  /** Linha de uma conta fixa no mês. Débito: tag que marca pago e alerta de
   * vencimento. Cartão: só informa se a fatura já foi paga — ninguém paga uma
   * assinatura isolada, paga-se a fatura inteira em Cartões. */
  function linha(cf: ContaFixa, modo: "debito" | "credito") {
    const oc = ocorrenciaDoMes(ocorrencias, cf.id, mesReferencia);
    const pago = oc?.status === "Pago";
    const data = oc?.data ?? ocorrenciaPrevista(cf, mesReferencia).data;
    const dias = diasAte(data, hoje);
    const editandoValor = oc && valorEditandoId === oc.id;
    const divergente = oc && oc.total_cents !== cf.total_cents;
    const detalhe =
      modo === "debito"
        ? `dia ${cf.dia_vencimento} · ${destino(cf)}`
        : `dia ${cf.dia_vencimento} · ${categoriaNome.get(cf.categoria_id ?? "") ?? "Sem categoria"}`;
    return (
      <li key={cf.id} className="py-2.5 first:pt-1 last:pb-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {filtro === "Casal" && <PersonDot pessoa={cf.pessoa} className="mt-2" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.875rem] text-ink">{cf.nome}</p>
              <p className="type-caption truncate text-ink-3">
                {detalhe}
                {modo === "debito" && !pago && dias < 0 && (
                  <span className="text-neg"> · venceu há {-dias} dia{dias < -1 ? "s" : ""}</span>
                )}
                {modo === "debito" && !pago && dias >= 0 && dias <= 7 && (
                  <span className="text-warn"> · {dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pl-5 sm:justify-end sm:pl-0">
            <div className="flex flex-col items-end">
              {editandoValor ? (
                <input
                  autoFocus
                  value={valorRascunho}
                  onChange={(e) => setValorRascunho(e.target.value)}
                  onBlur={() => salvarValor(oc)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") salvarValor(oc);
                    if (e.key === "Escape") setValorEditandoId(null);
                  }}
                  inputMode="decimal"
                  className="figures w-28 rounded-xs border border-hairline-strong bg-raised px-2 py-1 text-right text-[0.875rem] text-ink outline-none focus:border-ink-2"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => oc && iniciarEdicaoValor(oc)}
                  disabled={!oc}
                  title={oc ? "Editar o valor deste mês" : "Sem ocorrência neste mês"}
                  className="figures rounded-xs px-1 text-right text-[0.875rem] text-ink enabled:hover:bg-bg"
                >
                  {formatCentsToBRL(oc?.total_cents ?? cf.total_cents)}
                </button>
              )}
              {divergente && <span className="type-caption text-ink-3">previsto {formatCentsToBRL(cf.total_cents)}</span>}
            </div>

            {modo === "debito" ? (
              oc ? (
                <button
                  type="button"
                  onClick={() => alternarPago(oc)}
                  className={`type-caption min-w-[4.75rem] whitespace-nowrap rounded-xs px-2 py-1 text-center font-medium transition-colors hover:brightness-95 ${
                    pago ? "bg-brand-tint text-on-brand-tint" : "bg-warn-tint text-warn"
                  }`}
                >
                  {pago ? "Pago" : "A pagar"}
                </button>
              ) : (
                <span className="type-caption min-w-[4.75rem] text-center text-ink-3">—</span>
              )
            ) : (
              <span
                title={pago ? "A fatura deste mês já foi marcada como paga" : "Entra na fatura do cartão"}
                className={`type-caption min-w-[4.75rem] whitespace-nowrap rounded-xs px-2 py-1 text-center font-medium ${
                  pago ? "bg-brand-tint text-on-brand-tint" : "bg-track text-ink-2"
                }`}
              >
                {oc ? (pago ? "Fatura paga" : "Na fatura") : "—"}
              </span>
            )}

            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={() => setEditandoId(editandoId === cf.id ? null : cf.id)}
                aria-label="Editar conta fixa"
                className="rounded-sm p-1.5 text-ink-2 hover:bg-bg hover:text-ink"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => encerrar(cf)}
                aria-label="Encerrar conta fixa"
                className="rounded-sm p-1.5 text-ink-2 hover:bg-neg-tint hover:text-on-neg-tint"
              >
                <Ban size={15} />
              </button>
            </div>
          </div>
        </div>

        {editandoId === cf.id && (
          <div className="mt-3">
            <ContaFixaForm
              inicial={cf}
              ocorrenciaDoMes={oc}
              categorias={categorias}
              contas={contas}
              cartoes={cartoes}
              pessoaPadrao={cf.pessoa}
              mesReferencia={mesReferencia}
              onSalvar={(input, aplicacao) => editar(cf.id, input, aplicacao)}
              onCancelar={() => setEditandoId(null)}
              salvando={salvando}
            />
          </div>
        )}
      </li>
    );
  }

  function situacaoForaDeVigencia(cf: ContaFixa): string {
    if (!cf.ativo) return cf.fim ? `encerrada em ${mesAbrev(cf.fim)}` : "encerrada";
    if (cf.inicio > `${mesReferencia.year}-${String(mesReferencia.month).padStart(2, "0")}-01`) return `começa em ${mesAbrev(cf.inicio)}`;
    return cf.fim ? `terminou em ${mesAbrev(cf.fim)}` : "fora de vigência";
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filtros + ação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {([pessoaAtiva, outraPessoa, "Casal"] as Filtro[]).map((f) => (
            <Chip key={f} label={f} selected={filtro === f} onClick={() => setFiltro(f)} />
          ))}
        </div>
        <Button variant="primary" onClick={() => setCriando(true)} disabled={criando} className="px-3 py-2">
          <Plus size={16} /> Nova conta fixa
        </Button>
      </div>

      {criando && (
        <ContaFixaForm
          inicial={null}
          categorias={categorias}
          contas={contas}
          cartoes={cartoes}
          pessoaPadrao={filtro === "Casal" ? pessoaAtiva : filtro}
          mesReferencia={mesReferencia}
          onSalvar={(input) => criar(input)}
          onCancelar={() => setCriando(false)}
          salvando={salvando}
        />
      )}

      {/* Resumo do mês */}
      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="type-eyebrow text-ink-3">Previsto no mês</p>
          <Amount cents={resumo.total} semantic="none" className="type-title mt-1 block text-ink" />
          <p className="type-caption text-ink-3">
            {vigentes.length} {vigentes.length === 1 ? "conta" : "contas"} ·{" "}
            <span className="figures">{formatCentsToBRL(resumo.debitoTotal)}</span> débito ·{" "}
            <span className="figures">{formatCentsToBRL(resumo.creditoTotal)}</span> cartão
          </p>
        </div>
        <div>
          <p className="type-eyebrow text-ink-3">Débito já pago</p>
          <Amount cents={resumo.debitoPago} semantic="none" className="type-title mt-1 block text-pos" />
          <p className="type-caption text-ink-3">
            falta <span className="figures">{formatCentsToBRL(resumo.debitoFalta)}</span>
          </p>
        </div>
        <div>
          <p className="type-eyebrow text-ink-3">No cartão</p>
          <Amount cents={resumo.creditoTotal} semantic="none" className="type-title mt-1 block text-ink" />
          <p className="type-caption text-ink-3">entra na fatura, paga em Cartões</p>
        </div>
        <div>
          <p className="type-eyebrow text-ink-3">Atenção · débito</p>
          <p className="type-body mt-1 text-ink">
            {resumo.atrasadas > 0 && <span className="text-neg">{resumo.atrasadas} vencida{resumo.atrasadas > 1 ? "s" : ""}</span>}
            {resumo.atrasadas > 0 && resumo.proximos > 0 && " · "}
            {resumo.proximos > 0 && <span className="text-warn">{resumo.proximos} em 7 dias</span>}
            {resumo.atrasadas === 0 && resumo.proximos === 0 && <span className="text-ink-3">nada urgente</span>}
          </p>
        </div>
      </Card>

      {vigentes.length === 0 ? (
        <Card>
          <p className="type-body py-6 text-center text-ink-2">
            Nenhuma conta fixa vigente em {labelMes(mesReferencia)}
            {filtro !== "Casal" ? ` para ${filtro}` : ""}. Crie a primeira em “Nova conta fixa”.
          </p>
        </Card>
      ) : (
        <>
          {debito.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <h2 className="type-title text-ink">Débito</h2>
                <p className="type-caption text-ink-3">saem da conta uma a uma · marque pago aqui</p>
              </div>
              {gruposDebito.map((g) => (
                <Card key={g.nome} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="type-label text-ink">{g.nome}</p>
                    <Amount cents={g.total} semantic="none" className="type-label text-ink-2" />
                  </div>
                  <ul className="flex flex-col divide-y divide-hairline">{g.itens.map((cf) => linha(cf, "debito"))}</ul>
                </Card>
              ))}
            </section>
          )}

          {credito.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <h2 className="type-title text-ink">Cartão de crédito</h2>
                <p className="type-caption text-ink-3">entram na fatura e são pagas junto com ela</p>
              </div>
              {gruposCredito.map((g) => (
                <Card key={g.nome} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs bg-track text-ink-2">
                        <CreditCard size={14} />
                      </span>
                      <p className="type-label text-ink">{g.nome}</p>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="type-caption text-ink-3">{rotuloFatura(g.nome)}</span>
                      <Amount cents={g.total} semantic="none" className="type-label text-ink-2" />
                    </div>
                  </div>
                  <ul className="flex flex-col divide-y divide-hairline">{g.itens.map((cf) => linha(cf, "credito"))}</ul>
                  <Link
                    href={`/cartoes?ano=${mesReferencia.year}&mes=${mesReferencia.month}`}
                    className="type-caption mt-1 flex items-center gap-1 self-end text-ink-2 hover:text-ink"
                  >
                    Ver fatura em Cartões <ArrowRight size={12} />
                  </Link>
                </Card>
              ))}
            </section>
          )}
        </>
      )}

      {/* Encerradas / fora de vigência */}
      {foraDeVigencia.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setMostrarEncerradas((v) => !v)}
            className="type-label self-start text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {mostrarEncerradas ? "Ocultar" : "Mostrar"} {foraDeVigencia.length} fora de vigência neste mês
          </button>
          {mostrarEncerradas && (
            <Card>
              <ul className="flex flex-col divide-y divide-hairline">
                {foraDeVigencia.map((cf) => (
                  <li key={cf.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    {filtro === "Casal" && <PersonDot pessoa={cf.pessoa} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] text-ink-2">{cf.nome}</p>
                      <p className="type-caption truncate text-ink-3">
                        {situacaoForaDeVigencia(cf)} · {categoriaNome.get(cf.categoria_id ?? "") ?? "Sem categoria"} · {destino(cf)}
                      </p>
                    </div>
                    <Amount cents={cf.total_cents} semantic="none" className="text-[0.875rem] text-ink-3" />
                    {!cf.ativo ? (
                      <button
                        type="button"
                        onClick={() => reativar(cf)}
                        aria-label="Reativar"
                        title="Reativar"
                        className="rounded-sm p-1.5 text-ink-2 hover:bg-brand-tint hover:text-on-brand-tint"
                      >
                        <RotateCcw size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => excluir(cf)}
                        aria-label="Excluir"
                        title="Excluir (só sem lançamentos)"
                        className="rounded-sm p-1.5 text-ink-2 hover:bg-neg-tint hover:text-on-neg-tint"
                      >
                        <Ban size={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <p className="type-caption text-ink-3">
        Como funciona: cada conta fixa é um contrato. Ao abrir um mês, o app cria só as ocorrências que faltam
        daquele mês, para os contratos vigentes nele — nunca gera meses que ninguém abriu, nunca duplica. Encerrar
        remove apenas o futuro ainda não pago. Débito você marca pago aqui; assinatura no cartão entra na fatura e
        é paga inteira em Cartões.
      </p>
    </div>
  );
}
