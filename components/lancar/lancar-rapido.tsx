"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Mic, Repeat, Sparkles, Square, X } from "lucide-react";
import { criarLancamento, type Sugestoes } from "@/app/(app)/lancar/actions";
import { pagarContaFixaRapido, situacaoContaFixa, type SituacaoFixa } from "@/app/(app)/contas-fixas/rapido-actions";
import { interpretarLancamentoIA } from "@/app/(app)/lancar/ia-actions";
import type { LancamentoInterpretado } from "@/lib/ia/interpretar-lancamento";
import { estadoDaInterpretacao, pendenciasDoEstado, formDataDoEstado, permiteRecorrente, type EstadoLancamento } from "@/lib/lancar/interpretacao";
import { interpretarLoteLocal } from "@/lib/lancar/interpretar-local";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Cartao, Categoria, Conta, Pessoa } from "@/lib/domain/types";

/* ------------------------------------------------------------------------ */
/* Voz do navegador (Web Speech API, pt-BR)                                  */
/* ------------------------------------------------------------------------ */

interface ReconhecimentoVoz {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function criarReconhecimentoVoz(): ReconhecimentoVoz | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => ReconhecimentoVoz;
    webkitSpeechRecognition?: new () => ReconhecimentoVoz;
  };
  const Construtor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Construtor ? new Construtor() : null;
}

const EXEMPLOS = ["54 na Amazon no Business", "paguei 320 de luz da mãe hoje", "no Carbon: 87,90 iFood ontem e 45 Uber", "recebi 500 de freela na C6"];

function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

/* ------------------------------------------------------------------------ */

interface Item {
  chave: string;
  /** "local" = resolvido na hora pelo histórico, sem IA. */
  origem: "local" | "ia";
  lancamento: LancamentoInterpretado;
  estado: EstadoLancamento;
  selecionado: boolean;
  salvo: boolean;
  erro: string | null;
  /** Conta fixa existente: o que há no mês, para pagar/ajustar daqui. */
  fixa?: SituacaoFixa | null;
  fixaErro?: string | null;
  /** Texto do que foi feito (ex.: "setembro: valor ajustado e marcada como paga"). */
  feito?: string | null;
}

interface Props {
  contas: Conta[];
  cartoes: Cartao[];
  categorias: Categoria[];
  pessoaAtiva: Pessoa;
  /** Histórico de nomes (null enquanto carrega): alimenta o atalho local sem IA. */
  sugestoes: Sugestoes | null;
  onFechar: () => void;
  /** Abre o formulário completo já preenchido com a interpretação. */
  onAjustar: (l: LancamentoInterpretado) => void;
}

/**
 * Lançar rápido, separado do formulário: uma frase ou um lote ("54 amazon,
 * 30 ifood e paguei a luz"), digitado ou ditado; a IA devolve um item por
 * lançamento; cada item vira um recibo com checkbox. "Salvar N" grava os
 * marcados pela mesma ação do servidor que o formulário usa; "Ajustar" abre o
 * formulário só para aquele item. Fica aberto para o próximo lote.
 */
export function LancarRapido({ contas, cartoes, categorias, pessoaAtiva, sugestoes, onFechar, onAjustar }: Props) {
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const [interpretando, setInterpretando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ frase: string; itens: Item[] } | null>(null);
  const [salvos, setSalvos] = useState(0);
  const [suportaVoz] = useState(() => criarReconhecimentoVoz() !== null);
  const reconhecimento = useRef<ReconhecimentoVoz | null>(null);
  const campo = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!resultado) campo.current?.focus();
  }, [resultado]);

  function nomeDestino(e: EstadoLancamento): string | null {
    if (e.tipo === "Saida" && e.modo === "Credito") return cartoes.find((c) => c.id === e.destinoId)?.nome ?? null;
    return contas.find((c) => c.id === e.destinoId)?.nome ?? null;
  }
  function nomeCategoria(e: EstadoLancamento): string | null {
    return categorias.find((c) => c.id === e.categoriaId)?.nome ?? null;
  }
  /** Conta fixa não se salva daqui: a existente se paga em Contas fixas (senão
   * duplica a ocorrência do mês); a nova é um contrato, que merece o formulário. */
  function motivoSemSalvar(it: Pick<Item, "lancamento" | "estado">): "fixa-existente" | "fixa-nova" | "transferencia" | "pendencia" | null {
    if (it.lancamento.conta_fixa_existente) return "fixa-existente";
    if (it.estado.tipo === "Transferencia") return "transferencia";
    if (it.estado.tipo === "Saida" && it.estado.recorrente) return "fixa-nova";
    if (pendenciasDoEstado(it.estado).length > 0) return "pendencia";
    return null;
  }

  async function montarItens(lancamentos: LancamentoInterpretado[], origem: Item["origem"]): Promise<Item[]> {
    const hoje = hojeISO();
    const itens: Item[] = lancamentos.map((l, i) => {
      const estado = estadoDaInterpretacao(l, hoje);
      const semSalvar = motivoSemSalvar({ lancamento: l, estado });
      return { chave: `${Date.now()}-${i}`, origem, lancamento: l, estado, selecionado: semSalvar === null && l.confianca >= 0.6, salvo: false, erro: null };
    });
    // Conta fixa existente: busca a ocorrência do mês para oferecer pagar/ajustar aqui mesmo.
    await Promise.all(
      itens
        .filter((it) => it.lancamento.conta_fixa_existente)
        .map(async (it) => {
          const r = await situacaoContaFixa(it.lancamento.nome, it.estado.dataInput);
          if (r.ok) it.fixa = r.situacao;
          else it.fixaErro = r.error;
        })
    );
    return itens;
  }

  async function agirNaFixa(it: Item, marcarPago: boolean) {
    if (!it.fixa?.ocorrencia || salvando) return;
    const valor = parseCentsFromBRL(it.estado.valorInput);
    setSalvando(true);
    const r = await pagarContaFixaRapido({ ocorrenciaId: it.fixa.ocorrencia.id, valorCents: valor, marcarPago });
    setSalvando(false);
    setResultado((res) =>
      res && {
        ...res,
        itens: res.itens.map((x) =>
          x.chave !== it.chave ? x : r.error ? { ...x, erro: r.error } : { ...x, salvo: true, erro: null, feito: `${it.fixa!.mesLabel}: ${r.resumo ?? "ok"}` }
        ),
      }
    );
    if (!r.error) {
      setSalvos((n) => n + 1);
      toast(`${it.fixa.nome} de ${it.fixa.mesLabel}: ${r.resumo ?? "ok"}.`);
    }
  }

  async function interpretar(frase: string) {
    const t = frase.trim();
    if (!t || interpretando) return;
    setErro(null);
    // 1) Atalho local: nome conhecido + valor resolve na hora, sem chamar a IA.
    if (sugestoes) {
      const local = interpretarLoteLocal(t, {
        pessoa: pessoaAtiva,
        hojeISO: hojeISO(),
        contas,
        cartoes,
        historico: sugestoes.saidas,
        contasFixas: sugestoes.fixas,
      });
      if (local) {
        if (local.some((l) => l.conta_fixa_existente)) setInterpretando(true);
        const itens = await montarItens(local, "local");
        setInterpretando(false);
        setResultado({ frase: t, itens });
        return;
      }
    }
    // 2) IA para o resto: nomes novos, entradas, transferências, datas, contas fixas.
    setInterpretando(true);
    const r = await interpretarLancamentoIA(t);
    if (!r.ok) {
      setInterpretando(false);
      setErro(r.error);
      return;
    }
    const itens = await montarItens(r.lancamentos, "ia");
    setInterpretando(false);
    setResultado({ frase: t, itens });
  }

  function alternarVoz() {
    if (ouvindo) {
      reconhecimento.current?.stop();
      return;
    }
    const rec = criarReconhecimentoVoz();
    if (!rec) return;
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const frase = (e.results[0]?.[0]?.transcript ?? "").trim();
      if (!frase) return;
      // Campo vazio: ditou e já interpreta. Campo com texto: está compondo um
      // lote — acrescenta e deixa a pessoa mandar quando terminar.
      const anterior = texto.trim();
      const completo = anterior ? `${anterior}\n${frase}` : frase;
      setTexto(completo);
      if (!anterior) void interpretar(completo);
    };
    rec.onerror = () => {
      setOuvindo(false);
      setErro("Não consegui ouvir. Tente de novo ou digite.");
    };
    rec.onend = () => setOuvindo(false);
    reconhecimento.current = rec;
    setOuvindo(true);
    rec.start();
  }

  function outraFrase() {
    setResultado(null);
    setErro(null);
    setTexto("");
  }

  function alternar(chave: string) {
    setResultado((r) => r && { ...r, itens: r.itens.map((it) => (it.chave === chave ? { ...it, selecionado: !it.selecionado } : it)) });
  }

  async function salvarSelecionados() {
    if (!resultado || salvando) return;
    const alvo = resultado.itens.filter((it) => it.selecionado && !it.salvo);
    if (alvo.length === 0) return;
    setSalvando(true);
    setErro(null);
    let ok = 0;
    let atual = resultado.itens;
    for (const it of alvo) {
      const r = await criarLancamento({ status: "idle" }, formDataDoEstado(it.estado, contas, cartoes));
      atual = atual.map((x) =>
        x.chave === it.chave ? (r.status === "success" ? { ...x, salvo: true, selecionado: false, erro: null } : { ...x, erro: r.message ?? "Não foi possível salvar." }) : x
      );
      if (r.status === "success") ok += 1;
      setResultado({ frase: resultado.frase, itens: atual });
    }
    setSalvando(false);
    if (ok > 0) {
      setSalvos((n) => n + ok);
      toast(ok === 1 ? `${alvo[0].estado.nomeInput} salvo.` : `${ok} lançamentos salvos.`);
    }
    // Tudo resolvido (salvo ou sem ação possível): volta para a próxima frase.
    const restam = atual.filter((x) => !x.salvo && x.erro);
    const pendentesDeAcao = atual.filter((x) => !x.salvo && motivoSemSalvar(x) !== null);
    if (restam.length === 0 && pendentesDeAcao.length === 0 && ok === alvo.length) outraFrase();
  }

  const selecionados = resultado?.itens.filter((it) => it.selecionado && !it.salvo).length ?? 0;
  const podeSelecionar = resultado?.itens.some((it) => !it.salvo && motivoSemSalvar(it) === null) ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-scrim" onClick={onFechar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lançar rápido"
        className="glass glass-modal relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg sm:max-h-[90vh] sm:max-w-lg sm:rounded-lg"
      >
        <div className="flex items-center justify-between border-b border-hairline bg-surface px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            <p className="type-title text-ink">Lançar rápido</p>
            {salvos > 0 && <span className="type-caption text-ink-3">· {salvos} salvo{salvos > 1 ? "s" : ""}</span>}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-sm p-1.5 text-ink-2 transition-colors hover:bg-bg hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
          {!resultado ? (
            <>
              <p className="type-body text-ink-2">Descreva um ou vários lançamentos. A IA monta, você confere e salva.</p>
              <div className="flex items-start gap-2">
                <textarea
                  ref={campo}
                  value={texto}
                  onChange={(ev) => setTexto(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" && !ev.shiftKey) {
                      ev.preventDefault();
                      void interpretar(texto);
                    }
                  }}
                  rows={Math.min(5, Math.max(2, texto.split("\n").length + (texto.length > 60 ? 1 : 0)))}
                  placeholder={ouvindo ? "Ouvindo…" : "ex.: 54 na Amazon no Business, 30 no iFood e paguei 320 de luz da mãe"}
                  className={`${inputClasses} flex-1 resize-none py-3 text-[1rem] leading-snug`}
                  disabled={interpretando}
                  autoComplete="off"
                />
                {suportaVoz && (
                  <button
                    type="button"
                    onClick={alternarVoz}
                    aria-label={ouvindo ? "Parar de ouvir" : "Ditar"}
                    aria-pressed={ouvindo}
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                      ouvindo ? "border-transparent bg-neg text-white" : "border-hairline-strong bg-surface text-ink-2 hover:text-ink"
                    }`}
                  >
                    {ouvindo ? <Square size={16} /> : <Mic size={18} />}
                  </button>
                )}
              </div>
              <Button type="button" onClick={() => void interpretar(texto)} disabled={interpretando || !texto.trim()} className="w-full py-3">
                {interpretando ? "Interpretando…" : "Interpretar"}
              </Button>
              {erro && <p className="type-caption text-neg">{erro}</p>}
              <div className="flex flex-wrap gap-1.5">
                {EXEMPLOS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setTexto(ex)}
                    className="type-caption rounded-full border border-hairline bg-surface px-2.5 py-1 text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <p className="type-caption text-ink-3">Enter interpreta; Shift+Enter quebra a linha. Ditando com o campo já preenchido, a frase é acrescentada ao lote.</p>
            </>
          ) : (
            <>
              <button type="button" onClick={outraFrase} className="type-caption self-start text-left text-ink-3 underline-offset-2 hover:text-ink hover:underline">
                “{resultado.frase.length > 90 ? `${resultado.frase.slice(0, 90)}…` : resultado.frase}” · outra frase
              </button>
              {resultado.itens.length > 1 && (
                <p className="type-caption text-ink-2">
                  {resultado.itens.length} lançamentos encontrados. Desmarque o que não quiser salvar agora.
                </p>
              )}

              <ul className="flex flex-col gap-3">
                {resultado.itens.map((it) => {
                  const { estado: e, lancamento: l } = it;
                  const motivo = motivoSemSalvar(it);
                  const pct = Math.round(l.confianca * 100);
                  let valor = "R$ 0,00";
                  try {
                    valor = formatCentsToBRL(parseCentsFromBRL(e.valorInput));
                  } catch {
                    /* mantém zero */
                  }
                  const credito = e.tipo === "Saida" && e.modo === "Credito";
                  const detalhes: string[] = [];
                  if (motivo === "fixa-existente") {
                    // O bloco da conta fixa já diz tudo; aqui só a data da frase.
                  } else if (e.tipo === "Transferencia") {
                    detalhes.push(`${contas.find((c) => c.id === e.deContaId)?.nome ?? "?"} → ${contas.find((c) => c.id === e.paraContaId)?.nome ?? "?"}`);
                  } else {
                    if (e.tipo === "Saida") detalhes.push(credito ? "Crédito" : "Débito");
                    detalhes.push(nomeDestino(e) ?? (credito ? "cartão?" : "conta?"));
                    if (e.tipo === "Saida") detalhes.push(nomeCategoria(e) ?? "categoria?");
                    detalhes.push(e.tipo === "Entrada" ? (e.statusEntrada === "Recebido" ? "Recebido" : "A receber") : e.statusSaida);
                    if (e.formato === "Parcelado") detalhes.push(`${e.numeroParcelas}x`);
                    if (permiteRecorrente(e) && e.recorrente) detalhes.push(e.tipo === "Saida" ? "conta fixa" : "recorrente");
                  }
                  detalhes.push(formatDataBR(e.dataInput));
                  const faltando = pendenciasDoEstado(e);
                  return (
                    <li key={it.chave} className={`rounded-md border bg-surface p-4 ${it.salvo ? "border-hairline opacity-70" : it.selecionado ? "border-brand" : "border-hairline"}`}>
                      <div className="flex items-start gap-3">
                        {it.salvo ? (
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-on-brand-tint" aria-label="Salvo">
                            <Check size={13} />
                          </span>
                        ) : motivo === null ? (
                          <input
                            type="checkbox"
                            checked={it.selecionado}
                            onChange={() => alternar(it.chave)}
                            aria-label={`Salvar ${e.nomeInput}`}
                            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]"
                          />
                        ) : (
                          <span className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="truncate text-[0.9375rem] font-semibold text-ink">
                              <span className="type-eyebrow mr-2 text-ink-3">{e.tipo === "Saida" ? "Saída" : e.tipo === "Entrada" ? "Entrada" : "Transf."}</span>
                              {e.nomeInput || "Sem nome"}
                            </p>
                            <p className="figures shrink-0 text-[1.0625rem] font-semibold text-ink">{valor}</p>
                          </div>
                          <p className="type-caption mt-0.5 text-ink-2">
                            {detalhes.map((d, i) => (
                              <span key={i} className={d.endsWith("?") ? "text-warn" : ""}>
                                {i > 0 && <span className="text-ink-3"> · </span>}
                                {d.endsWith("?") ? `falta ${d.slice(0, -1)}` : d}
                              </span>
                            ))}
                          </p>
                          {motivo !== "fixa-existente" && (
                            <p className={`type-caption mt-1 ${pct >= 60 ? "text-ink-3" : "text-warn"}`}>
                              {it.origem === "local" ? "Pelo histórico, sem IA." : `${pct}% de confiança${l.duvidas.length > 0 ? `. ${l.duvidas.join(" ")}` : ""}`}
                            </p>
                          )}
                          {motivo === "fixa-existente" && !it.salvo && (
                            <FixaNoMes item={it} ocupado={salvando} onAgir={(pago) => void agirNaFixa(it, pago)} onFechar={onFechar} />
                          )}
                          {it.salvo && it.feito && <p className="type-caption mt-1.5 text-on-brand-tint">{it.feito}</p>}
                          {motivo === "fixa-nova" && <p className="type-caption mt-1.5 text-ink-3">Conta fixa nova é um contrato mensal: salve pelo formulário.</p>}
                          {motivo === "transferencia" && <p className="type-caption mt-1.5 text-ink-3">Transferência passa pelo formulário para confirmar as duas contas.</p>}
                          {motivo === "pendencia" && <p className="type-caption mt-1.5 text-warn">Falta {faltando.join(" e ")}: ajuste no formulário.</p>}
                          {it.erro && <p className="type-caption mt-1.5 text-neg">{it.erro}</p>}
                          {!it.salvo && motivo !== "fixa-existente" && (
                            <button
                              type="button"
                              onClick={() => onAjustar(l)}
                              className="type-caption mt-2 font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                            >
                              Ajustar no formulário
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {erro && <p className="type-body rounded-sm bg-neg-tint px-4 py-3 text-on-neg-tint">{erro}</p>}

              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                {podeSelecionar && (
                  <Button type="button" onClick={() => void salvarSelecionados()} disabled={salvando || selecionados === 0} className="flex-1 py-3">
                    {salvando ? "Salvando…" : selecionados <= 1 ? "Salvar" : `Salvar ${selecionados}`}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={outraFrase} className="flex-1 py-3">
                  Outra frase
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Bloco de uma conta fixa existente dentro do item: mostra o mês (previsto,
 * real, status ou fatura) e as ações possíveis — pagar com o valor da frase,
 * só ajustar o valor, ou ir para Contas fixas quando não há o que fazer aqui.
 */
function FixaNoMes({ item, ocupado, onAgir, onFechar }: { item: Item; ocupado: boolean; onAgir: (marcarPago: boolean) => void; onFechar: () => void }) {
  const f = item.fixa;
  let valorFrase = 0;
  try {
    valorFrase = parseCentsFromBRL(item.estado.valorInput);
  } catch {
    /* sem valor válido: só link */
  }
  const linkFixas = (
    <Link href="/contas-fixas" onClick={onFechar} className="font-semibold underline underline-offset-2">
      Contas fixas
    </Link>
  );
  if (!f) {
    return (
      <p className="type-caption mt-1.5 flex items-start gap-1.5 text-on-brand-tint">
        <Repeat size={13} className="mt-0.5 shrink-0" />
        <span>
          Já é uma conta fixa. {item.fixaErro ? `${item.fixaErro} ` : ""}Veja em {linkFixas}.
        </span>
      </p>
    );
  }
  const oc = f.ocorrencia;
  const difere = !!oc && valorFrase > 0 && valorFrase !== oc.totalCents;
  const credito = f.metodo === "Crédito";
  const disseQuePagou = item.estado.statusSaida === "Pago";
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-sm bg-brand-tint px-3 py-2.5 text-on-brand-tint">
      <p className="type-caption flex items-start gap-1.5">
        <Repeat size={13} className="mt-0.5 shrink-0" />
        <span>
          Conta fixa · {f.mesLabel}: previsto {formatCentsToBRL(f.previstoCents)}
          {oc ? ` · no mês ${formatCentsToBRL(oc.totalCents)} · ${credito ? f.faturaLabel ?? "na fatura" : oc.status === "Pago" ? "já paga" : "a pagar"}` : " · mês ainda sem ocorrência"}
        </span>
      </p>
      {oc && (
        <div className="flex flex-wrap gap-1.5">
          {!credito && oc.status !== "Pago" && (
            <Button type="button" onClick={() => onAgir(true)} disabled={ocupado} className="px-3 py-1.5">
              {ocupado ? "Salvando…" : `Pagar ${formatCentsToBRL(valorFrase > 0 ? valorFrase : oc.totalCents)}`}
            </Button>
          )}
          {difere && (
            <Button type="button" variant="outline" onClick={() => onAgir(false)} disabled={ocupado} className="px-3 py-1.5">
              {credito || oc.status === "Pago" ? `Ajustar para ${formatCentsToBRL(valorFrase)}` : "Só ajustar o valor"}
            </Button>
          )}
          {!credito && oc.status === "Pago" && !difere && disseQuePagou && <span className="type-caption self-center">Nada a fazer: já estava paga com esse valor.</span>}
        </div>
      )}
      <p className="type-caption">Detalhes em {linkFixas}.</p>
    </div>
  );
}
