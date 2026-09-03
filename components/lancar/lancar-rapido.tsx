"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, Repeat, Sparkles, Square, X } from "lucide-react";
import { criarLancamento } from "@/app/(app)/lancar/actions";
import { interpretarLancamentoIA } from "@/app/(app)/lancar/ia-actions";
import type { LancamentoInterpretado } from "@/lib/ia/interpretar-lancamento";
import { estadoDaInterpretacao, pendenciasDoEstado, formDataDoEstado, permiteRecorrente, type EstadoLancamento } from "@/lib/lancar/interpretacao";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Cartao, Categoria, Conta } from "@/lib/domain/types";

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

const EXEMPLOS = ["54 na Amazon no Business", "paguei 320 de luz da mãe hoje", "ifood ontem 87,90 em 3x no Carbon", "recebi 500 de freela na C6"];

function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

function Linha({ label, value, alerta = false }: { label: string; value: string | null; alerta?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="type-caption shrink-0 text-ink-3">{label}</dt>
      <dd className={`type-label text-right ${value ? (alerta ? "text-warn" : "text-ink") : "text-warn"}`}>{value ?? "falta escolher"}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

interface Props {
  contas: Conta[];
  cartoes: Cartao[];
  categorias: Categoria[];
  onFechar: () => void;
  /** Abre o formulário completo já preenchido com a interpretação. */
  onAjustar: (l: LancamentoInterpretado) => void;
}

/**
 * Lançar rápido, separado do formulário: uma frase (digitada ou ditada), a IA
 * devolve o lançamento, o recibo mostra o que ela entendeu e a pessoa decide:
 * salvar direto (mesma ação do servidor que o formulário usa), ajustar no
 * formulário completo, ou tentar outra frase. Fica aberto depois de salvar
 * para lançar vários seguidos.
 */
export function LancarRapido({ contas, cartoes, categorias, onFechar, onAjustar }: Props) {
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const [interpretando, setInterpretando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ frase: string; lancamento: LancamentoInterpretado; estado: EstadoLancamento } | null>(null);
  const [salvos, setSalvos] = useState(0);
  const [suportaVoz] = useState(() => criarReconhecimentoVoz() !== null);
  const reconhecimento = useRef<ReconhecimentoVoz | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!resultado) campo.current?.focus();
  }, [resultado]);

  async function interpretar(frase: string) {
    const t = frase.trim();
    if (!t || interpretando) return;
    setInterpretando(true);
    setErro(null);
    const r = await interpretarLancamentoIA(t);
    setInterpretando(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setResultado({ frase: t, lancamento: r.lancamento, estado: estadoDaInterpretacao(r.lancamento, hojeISO()) });
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
      const frase = e.results[0]?.[0]?.transcript ?? "";
      setTexto(frase);
      void interpretar(frase);
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

  async function salvar() {
    if (!resultado || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await criarLancamento({ status: "idle" }, formDataDoEstado(resultado.estado, contas, cartoes));
    setSalvando(false);
    if (r.status !== "success") {
      setErro(r.message ?? "Não foi possível salvar.");
      return;
    }
    toast(`${resultado.estado.nomeInput} · R$ ${resultado.estado.valorInput} salvo.`);
    setSalvos((n) => n + 1);
    outraFrase();
  }

  const e = resultado?.estado ?? null;
  const l = resultado?.lancamento ?? null;
  const pct = l ? Math.round(l.confianca * 100) : 0;
  const pendencias = e ? pendenciasDoEstado(e) : [];
  const transferencia = e?.tipo === "Transferencia";
  // Conta fixa não se salva daqui: a existente se paga em Contas fixas (senão
  // duplica a ocorrência do mês); a nova é um contrato, que merece o formulário.
  const fixaExistente = !!l?.conta_fixa_existente;
  const fixaNova = !!e && e.tipo === "Saida" && e.recorrente && !fixaExistente;
  const salvaDireto = !transferencia && !fixaExistente && !fixaNova;
  const nomeDestino = e
    ? e.tipo === "Saida" && e.modo === "Credito"
      ? cartoes.find((c) => c.id === e.destinoId)?.nome ?? null
      : contas.find((c) => c.id === e.destinoId)?.nome ?? null
    : null;
  const nomeCategoria = e ? categorias.find((c) => c.id === e.categoriaId)?.nome ?? null : null;
  let valorResumo = "R$ 0,00";
  if (e) {
    try {
      valorResumo = formatCentsToBRL(parseCentsFromBRL(e.valorInput));
    } catch {
      /* mantém zero */
    }
  }
  const parcelamento =
    e && e.formato === "Parcelado" && l
      ? `${e.numeroParcelas}x de ${formatCentsToBRL(Math.round(Math.abs(l.valor_cents) / Number(e.numeroParcelas)))}`
      : null;

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
              <p className="type-body text-ink-2">Descreva o lançamento em uma frase. A IA monta, você confere e salva.</p>
              <div className="flex items-center gap-2">
                <input
                  ref={campo}
                  value={texto}
                  onChange={(ev) => setTexto(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      void interpretar(texto);
                    }
                  }}
                  placeholder={ouvindo ? "Ouvindo…" : "ex.: 54 na Amazon no Business"}
                  className={`${inputClasses} flex-1 py-3 text-[1rem]`}
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
            </>
          ) : (
            <>
              <button type="button" onClick={outraFrase} className="type-caption self-start text-left text-ink-3 underline-offset-2 hover:text-ink hover:underline">
                “{resultado.frase}” · outra frase
              </button>

              <div className="flex flex-col gap-4 rounded-md border border-hairline bg-surface p-5">
                <div>
                  <p className="type-eyebrow text-ink-3">{e!.tipo === "Saida" ? "Saída" : e!.tipo === "Entrada" ? "Entrada" : "Transferência"}</p>
                  <p className="type-headline mt-1 text-ink">{e!.nomeInput || "Sem nome"}</p>
                  <p className="type-display figures mt-1 text-ink">{valorResumo}</p>
                </div>
                <div className="rule-ledger" aria-hidden="true" />
                <dl className="flex flex-col gap-2.5">
                  {transferencia ? (
                    <>
                      <Linha label="De" value={contas.find((c) => c.id === e!.deContaId)?.nome ?? null} />
                      <Linha label="Para" value={contas.find((c) => c.id === e!.paraContaId)?.nome ?? null} />
                    </>
                  ) : (
                    <>
                      {e!.tipo === "Saida" && <Linha label="Método" value={e!.modo === "Credito" ? "Crédito" : "Débito"} />}
                      <Linha label={e!.tipo === "Saida" && e!.modo === "Credito" ? "Cartão" : "Conta"} value={nomeDestino} />
                      {e!.tipo === "Saida" && <Linha label="Categoria" value={nomeCategoria} />}
                      <Linha label="Status" value={e!.tipo === "Entrada" ? (e!.statusEntrada === "Recebido" ? "Recebido" : "A receber") : e!.statusSaida} />
                      {parcelamento && <Linha label="Parcelamento" value={parcelamento} />}
                      {permiteRecorrente(e!) && e!.recorrente && (
                        <Linha label={e!.tipo === "Saida" ? "Conta fixa" : "Recorrência"} value={e!.tipo === "Saida" ? "Mensal, sem prazo" : "Próximos 12 meses"} />
                      )}
                    </>
                  )}
                  <Linha label={e!.tipo === "Saida" && e!.modo === "Credito" ? "Data da compra" : "Data"} value={formatDataBR(e!.dataInput)} />
                </dl>
              </div>

              <p className={`type-caption ${pct >= 60 ? "text-ink-2" : "text-warn"}`}>
                {pct}% de confiança.{l!.duvidas.length > 0 ? ` ${l!.duvidas.join(" ")}` : ""}
              </p>
              {erro && <p className="type-body rounded-sm bg-neg-tint px-4 py-3 text-on-neg-tint">{erro}</p>}

              {fixaExistente ? (
                <div className="flex items-start gap-2 rounded-sm bg-brand-tint px-4 py-3 text-on-brand-tint">
                  <Repeat size={15} className="mt-0.5 shrink-0" />
                  <p className="type-body">
                    “{e!.nomeInput}” já é uma conta fixa. Para registrar o pagamento do mês sem duplicar, use{" "}
                    <Link href="/contas-fixas" onClick={onFechar} className="font-semibold underline underline-offset-2">
                      Contas fixas
                    </Link>
                    .
                  </p>
                </div>
              ) : fixaNova ? (
                <p className="type-caption text-ink-3">Conta fixa nova é um contrato mensal: confira e salve pelo formulário.</p>
              ) : transferencia ? (
                <p className="type-caption text-ink-3">Transferências passam pelo formulário para você confirmar as duas contas.</p>
              ) : pendencias.length > 0 ? (
                <p className="type-caption text-warn">Falta {pendencias.join(" e ")}. Ajuste no formulário para salvar.</p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                {salvaDireto && (
                  <Button type="button" onClick={() => void salvar()} disabled={salvando || pendencias.length > 0} className="flex-1 py-3">
                    {salvando ? "Salvando…" : "Salvar"}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => onAjustar(resultado.lancamento)} className="flex-1 py-3">
                  Ajustar no formulário
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
