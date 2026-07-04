"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { criarLancamento, type CriarLancamentoState } from "./actions";
import { categoriasParaPessoa } from "@/lib/domain/categoria";
import { addMonths, parseCalendarDate } from "@/lib/domain/calendar-date";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { MESES_ABREV } from "@/lib/format/meses";
import type { Cartao, Categoria, Conta, EntradaStatus, FormatoCompra, Pessoa, SaidaStatus } from "@/lib/domain/types";

type Tipo = "Entrada" | "Saida" | "Transferencia";
type Modo = "Debito" | "Credito";

const STATUS_SAIDA: SaidaStatus[] = ["A pagar", "Pago"];
const STATUS_ENTRADA: { label: string; value: EntradaStatus }[] = [
  { label: "A receber", value: "Não recebido" },
  { label: "Recebido", value: "Recebido" },
];
const FORMATOS: FormatoCompra[] = ["À vista", "Parcelado"];

function mesAno(data: { month: number; year: number }): string {
  return `${MESES_ABREV[data.month - 1]}/${data.year}`;
}

const initialState: CriarLancamentoState = { status: "idle" };

/** Data de hoje em America/Sao_Paulo (só para preencher o campo — o cálculo
 * autoritativo de vencimento/fatura roda no servidor, ver lib/domain). */
function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function GrupoDeEscolha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="type-label mb-2 text-ink-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Linha do recibo (rótulo à esquerda, escolha à direita). Valor nulo vira
 * um traço apagado, indicando o que ainda falta preencher. */
function ResumoLinha({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="type-caption shrink-0 text-ink-3">{label}</dt>
      <dd className={`type-label text-right ${value ? "text-ink" : "text-ink-3"}`}>{value ?? "—"}</dd>
    </div>
  );
}

/** "YYYY-MM-DD" (valor de <input type=date>) para "DD/MM/YYYY". */
function formatDataBR(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
}

interface LancarFormProps {
  contas: Conta[];
  cartoes: Cartao[];
  categorias: Categoria[];
  pessoaAtiva: Pessoa;
}

export function LancarForm({ contas, cartoes, categorias, pessoaAtiva }: LancarFormProps) {
  const [state, formAction, isPending] = useActionState(criarLancamento, initialState);

  const [tipo, setTipo] = useState<Tipo>("Saida");
  const [modo, setModo] = useState<Modo>("Debito");
  const [destinoId, setDestinoId] = useState("");
  const [deContaId, setDeContaId] = useState("");
  const [paraContaId, setParaContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [statusSaida, setStatusSaida] = useState<SaidaStatus>("A pagar");
  const [statusEntrada, setStatusEntrada] = useState<EntradaStatus>("Não recebido");
  const [formato, setFormato] = useState<FormatoCompra>("À vista");
  const [numeroParcelas, setNumeroParcelas] = useState("2");
  const [recorrente, setRecorrente] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [valorInput, setValorInput] = useState("");
  const [dataInput, setDataInput] = useState(hojeISO());

  // A calculadora global manda o resultado pra cá pelo botão "Usar valor".
  useEffect(() => {
    function onUsarValor(event: Event) {
      const cents = (event as CustomEvent<{ cents: number }>).detail?.cents;
      if (typeof cents === "number") {
        setValorInput(formatCentsToBRL(cents).replace("R$", "").trim());
      }
    }
    window.addEventListener("budget:usar-valor", onUsarValor);
    return () => window.removeEventListener("budget:usar-valor", onUsarValor);
  }, []);

  // Saída/entrada mostram só as contas/cartões da pessoa ativa do menu;
  // transferência (mais abaixo) usa todas as contas do casal.
  const contasDaPessoa = contas.filter((c) => c.dono === pessoaAtiva);
  const cartoesDaPessoa = cartoes.filter((c) => c.dono === pessoaAtiva);
  const opcoesDestino = tipo === "Entrada" ? contasDaPessoa : modo === "Credito" ? cartoesDaPessoa : contasDaPessoa;

  // Na transferência, "pessoa" é o dono da conta de origem (quem move o
  // dinheiro); nos outros tipos, o dono do destino selecionado.
  const pessoaSelecionada = useMemo(() => {
    if (tipo === "Transferencia") return contas.find((c) => c.id === deContaId)?.dono ?? null;
    return opcoesDestino.find((o) => o.id === destinoId)?.dono ?? null;
  }, [tipo, contas, deContaId, opcoesDestino, destinoId]);

  const cartaoSelecionado = useMemo(() => {
    if (tipo !== "Saida" || modo !== "Credito") return null;
    return cartoes.find((c) => c.id === destinoId) ?? null;
  }, [tipo, modo, cartoes, destinoId]);

  const contaVinculadaNome = useMemo(() => {
    if (!cartaoSelecionado?.conta_vinculada_id) return null;
    return contas.find((c) => c.id === cartaoSelecionado.conta_vinculada_id)?.nome ?? null;
  }, [cartaoSelecionado, contas]);

  const categoriasFiltradas = useMemo(() => {
    if (!pessoaSelecionada) return [];
    return categoriasParaPessoa(categorias, pessoaSelecionada);
  }, [categorias, pessoaSelecionada]);

  const permiteRecorrente =
    tipo === "Entrada" || (tipo === "Saida" && !(modo === "Credito" && formato === "Parcelado"));

  const previewParcelamento = useMemo(() => {
    if (!(tipo === "Saida" && modo === "Credito" && formato === "Parcelado")) return null;
    const n = Number(numeroParcelas);
    if (!Number.isFinite(n) || n < 2) return null;
    let totalCents: number;
    try {
      totalCents = parseCentsFromBRL(valorInput);
    } catch {
      return null;
    }
    if (totalCents <= 0) return null;
    let dataCompra;
    try {
      dataCompra = parseCalendarDate(dataInput);
    } catch {
      return null;
    }
    const valorBase = Math.floor(totalCents / n);
    const ajusteUltima = totalCents - valorBase * (n - 1);
    const dataFinal = addMonths(dataCompra, n - 1);
    const parcelasIguais = valorBase === ajusteUltima;
    return {
      texto: parcelasIguais
        ? `${n}x de ${formatCentsToBRL(valorBase)}`
        : `${n - 1}x de ${formatCentsToBRL(valorBase)} + 1x de ${formatCentsToBRL(ajusteUltima)}`,
      periodo: `${mesAno(dataCompra)} a ${mesAno(dataFinal)}`,
    };
  }, [tipo, modo, formato, numeroParcelas, valorInput, dataInput]);

  const previewRecorrencia = useMemo(() => {
    if (!(permiteRecorrente && recorrente)) return null;
    let cents: number;
    try {
      cents = parseCentsFromBRL(valorInput);
    } catch {
      return null;
    }
    if (cents <= 0) return null;
    let dataBase;
    try {
      dataBase = parseCalendarDate(dataInput);
    } catch {
      return null;
    }
    const dataFinal = addMonths(dataBase, 11);
    return {
      valor: formatCentsToBRL(cents),
      periodo: `${mesAno(dataBase)} a ${mesAno(dataFinal)}`,
    };
  }, [permiteRecorrente, recorrente, valorInput, dataInput]);

  // Ajuste de estado durante a renderização (sem efeito) quando o resultado da
  // action muda: reseta o formulário para o próximo lançamento após sucesso.
  const [statusTratado, setStatusTratado] = useState(state.status);
  if (state.status !== statusTratado) {
    setStatusTratado(state.status);
    if (state.status === "success") {
      setCategoriaId("");
      setRecorrente(false);
      setFormKey((key) => key + 1);
    }
  }

  function handleTipoChange(novoTipo: Tipo) {
    setTipo(novoTipo);
    setDestinoId("");
    setDeContaId("");
    setParaContaId("");
    setCategoriaId("");
    setFormato("À vista");
    setRecorrente(false);
  }

  function handleModoChange(novoModo: Modo) {
    setModo(novoModo);
    setDestinoId("");
    setCategoriaId("");
    setFormato("À vista");
    setRecorrente(false);
  }

  function handleFormatoChange(novoFormato: FormatoCompra) {
    setFormato(novoFormato);
    if (novoFormato === "Parcelado") setRecorrente(false);
  }

  function handleDestinoChange(id: string) {
    setDestinoId(id);
    setCategoriaId("");
  }

  // Valores derivados para o recibo lateral — refletem, em texto, o que o
  // formulário vai gravar.
  const valorResumo = (() => {
    try {
      return formatCentsToBRL(parseCentsFromBRL(valorInput));
    } catch {
      return "R$ 0,00";
    }
  })();
  const destinoNome = opcoesDestino.find((o) => o.id === destinoId)?.nome ?? null;
  const categoriaNome = categoriasFiltradas.find((c) => c.id === categoriaId)?.nome ?? null;
  const statusResumo =
    tipo === "Entrada" ? STATUS_ENTRADA.find((s) => s.value === statusEntrada)?.label ?? null : statusSaida;
  const destinoLabel = tipo === "Entrada" ? "Conta" : modo === "Credito" ? "Cartão" : "Conta";
  const deContaNome = contas.find((c) => c.id === deContaId)?.nome ?? null;
  const paraContaNome = contas.find((c) => c.id === paraContaId)?.nome ?? null;

  const transferenciaCompleta = tipo === "Transferencia" && !!deContaId && !!paraContaId && deContaId !== paraContaId;
  const podeSalvar = tipo === "Transferencia" ? transferenciaCompleta : !!destinoId;

  return (
    <form key={formKey} action={formAction} className="flex flex-1 flex-col">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="modo" value={modo} />
      <input type="hidden" name="destinoId" value={destinoId} />
      <input type="hidden" name="deContaId" value={deContaId} />
      <input type="hidden" name="paraContaId" value={paraContaId} />
      <input type="hidden" name="categoriaId" value={categoriaId} />
      <input type="hidden" name="status" value={tipo === "Entrada" ? statusEntrada : statusSaida} />
      <input type="hidden" name="pessoa" value={pessoaSelecionada ?? ""} />
      <input type="hidden" name="formato" value={formato} />
      <input type="hidden" name="numeroParcelas" value={formato === "Parcelado" ? numeroParcelas : "1"} />
      <input type="hidden" name="contaVinculadaId" value={cartaoSelecionado?.conta_vinculada_id ?? ""} />
      <input type="hidden" name="recorrente" value={permiteRecorrente && recorrente ? "true" : "false"} />

      {/* Duas colunas no desktop: campos à esquerda, recibo + salvar fixos à
          direita. No mobile empilha na ordem natural (valor → campos → recibo
          → salvar). */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
      <div className="flex flex-col gap-6">
      <Card variant="raised" className="flex flex-col gap-1 p-6">
        <label htmlFor="nome" className="type-eyebrow text-ink-3">
          Nome
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          placeholder="Nome do lançamento"
          required
          defaultValue=""
          className="type-headline w-full border-none bg-transparent text-ink outline-none placeholder:text-ink-3/50 focus-visible:outline-none"
        />
        <label htmlFor="valor" className="type-eyebrow mt-3 block border-t border-hairline pt-3.5 text-ink-3">
          Valor
        </label>
        <div className="flex items-baseline gap-2">
          <span className="type-headline text-ink-3" aria-hidden="true">
            R$
          </span>
          <input
            id="valor"
            name="valor"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            required
            value={valorInput}
            onChange={(event) => setValorInput(event.target.value)}
            onBlur={() => {
              try {
                setValorInput(formatCentsToBRL(parseCentsFromBRL(valorInput)).replace("R$", "").trim());
              } catch {
                // valor inválido — deixa como está, a validação do servidor cobre isso
              }
            }}
            className="type-hero figures w-full border-none bg-transparent text-ink outline-none placeholder:text-ink-3/50 focus-visible:outline-none"
          />
        </div>
      </Card>

      <GrupoDeEscolha label="Tipo">
        <Chip label="Saída" selected={tipo === "Saida"} onClick={() => handleTipoChange("Saida")} />
        <Chip label="Entrada" selected={tipo === "Entrada"} onClick={() => handleTipoChange("Entrada")} />
        <Chip label="Transferência" selected={tipo === "Transferencia"} onClick={() => handleTipoChange("Transferencia")} />
      </GrupoDeEscolha>

      {tipo === "Transferencia" && (
        <>
          <GrupoDeEscolha label="Conta de origem">
            {contas.map((c) => (
              <Chip
                key={c.id}
                label={c.nome}
                selected={deContaId === c.id}
                onClick={() => {
                  setDeContaId(c.id);
                  if (paraContaId === c.id) setParaContaId("");
                }}
              />
            ))}
          </GrupoDeEscolha>
          <GrupoDeEscolha label="Conta de destino">
            {contas
              .filter((c) => c.id !== deContaId)
              .map((c) => (
                <Chip
                  key={c.id}
                  label={c.nome}
                  selected={paraContaId === c.id}
                  onClick={() => setParaContaId(c.id)}
                />
              ))}
          </GrupoDeEscolha>
          {deContaNome && paraContaNome && (
            <p className="type-caption text-ink-3">
              Move o saldo de {deContaNome} para {paraContaNome}. Não conta como receita nem despesa.
            </p>
          )}
        </>
      )}

      {tipo === "Saida" && (
        <GrupoDeEscolha label="Método">
          <Chip label="Débito" selected={modo === "Debito"} onClick={() => handleModoChange("Debito")} />
          <Chip label="Crédito" selected={modo === "Credito"} onClick={() => handleModoChange("Credito")} />
        </GrupoDeEscolha>
      )}

      {tipo !== "Transferencia" && (
      <div>
        <GrupoDeEscolha label={tipo === "Entrada" ? "Conta" : modo === "Credito" ? "Cartão" : "Conta"}>
          {opcoesDestino.map((o) => (
            <Chip
              key={o.id}
              label={o.nome}
              selected={destinoId === o.id}
              onClick={() => handleDestinoChange(o.id)}
            />
          ))}
        </GrupoDeEscolha>
        {tipo === "Saida" && modo === "Credito" && cartaoSelecionado && !contaVinculadaNome && (
          <p className="type-caption mt-2 text-warn">
            Este cartão ainda não tem conta vinculada — configure em Configurações para debitar automaticamente
            quando marcado como pago.
          </p>
        )}
        {tipo === "Saida" && modo === "Credito" && contaVinculadaNome && (
          <p className="type-caption mt-2 text-ink-3">Fatura paga pela conta {contaVinculadaNome}</p>
        )}
      </div>
      )}

      {tipo === "Saida" && modo === "Credito" && (
        <GrupoDeEscolha label="Formato">
          {FORMATOS.map((f) => (
            <Chip key={f} label={f} selected={formato === f} onClick={() => handleFormatoChange(f)} />
          ))}
        </GrupoDeEscolha>
      )}

      {tipo === "Saida" && modo === "Credito" && formato === "Parcelado" && (
        <div>
          <label htmlFor="parcelas" className="type-label mb-1.5 block text-ink-2">
            Parcelas
          </label>
          <input
            id="parcelas"
            type="number"
            min={2}
            max={48}
            step={1}
            value={numeroParcelas}
            onChange={(event) => setNumeroParcelas(event.target.value)}
            className={`${inputClasses} w-24`}
          />
          {previewParcelamento && (
            <p className="type-caption mt-2 text-ink-2">
              {previewParcelamento.texto} · {previewParcelamento.periodo}
            </p>
          )}
        </div>
      )}

      {tipo === "Saida" && (
        <div>
          <p className="type-label mb-2 text-ink-2">Categoria</p>
          {pessoaSelecionada ? (
            <div className="flex flex-wrap gap-1.5">
              {categoriasFiltradas.map((c) => (
                <Chip key={c.id} label={c.nome} selected={categoriaId === c.id} onClick={() => setCategoriaId(c.id)} />
              ))}
            </div>
          ) : (
            <p className="type-caption text-ink-3">
              Escolha {modo === "Credito" ? "o cartão" : "a conta"} acima — as categorias dependem de quem é o gasto.
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="data" className="type-label mb-1.5 block text-ink-2">
          {tipo === "Saida" && modo === "Credito" ? "Data da compra" : "Data"}
        </label>
        <input
          id="data"
          name="data"
          type="date"
          required
          value={dataInput}
          onChange={(event) => setDataInput(event.target.value)}
          className={`${inputClasses} md:w-64`}
        />
      </div>

      {tipo !== "Transferencia" && (
      <div>
        <GrupoDeEscolha label="Status">
          {tipo === "Entrada"
            ? STATUS_ENTRADA.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  selected={statusEntrada === s.value}
                  onClick={() => setStatusEntrada(s.value)}
                />
              ))
            : STATUS_SAIDA.map((s) => (
                <Chip key={s} label={s} selected={statusSaida === s} onClick={() => setStatusSaida(s)} />
              ))}
        </GrupoDeEscolha>
        {tipo === "Saida" && modo === "Credito" && formato === "Parcelado" && statusSaida === "Pago" && (
          <p className="type-caption mt-2 text-warn">
            Marcar como Pago aqui quita as {numeroParcelas || "N"} parcelas de uma vez e debita o valor total agora
            {contaVinculadaNome ? ` da conta ${contaVinculadaNome}` : ""}.
          </p>
        )}
      </div>
      )}

      {permiteRecorrente && (
        <div>
          <GrupoDeEscolha label="É recorrente?">
            <Chip label="Não" selected={!recorrente} onClick={() => setRecorrente(false)} />
            <Chip label="Sim" selected={recorrente} onClick={() => setRecorrente(true)} />
          </GrupoDeEscolha>
          {recorrente && (
            <p className="type-caption mt-2 text-ink-2">
              Vai gerar os próximos 12 meses
              {previewRecorrencia ? ` de ${previewRecorrencia.valor} (${previewRecorrencia.periodo})` : ""}. Só este
              primeiro fica com o status escolhido acima — os meses futuros nascem como{" "}
              {tipo === "Entrada" ? "“A receber”" : "“A pagar”"}.
            </p>
          )}
        </div>
      )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
        <Card className="flex flex-col gap-4">
          <div>
            <p className="type-eyebrow text-ink-3">Resumo</p>
            <p className="type-display figures mt-1 text-ink">{valorResumo}</p>
          </div>
          <div className="rule-ledger" aria-hidden="true" />
          <dl className="flex flex-col gap-2.5">
            <ResumoLinha
              label="Tipo"
              value={tipo === "Saida" ? "Saída" : tipo === "Entrada" ? "Entrada" : "Transferência"}
            />
            {tipo === "Transferencia" ? (
              <>
                <ResumoLinha label="De" value={deContaNome} />
                <ResumoLinha label="Para" value={paraContaNome} />
                <ResumoLinha label="Data" value={formatDataBR(dataInput)} />
              </>
            ) : (
              <>
                {tipo === "Saida" && <ResumoLinha label="Método" value={modo === "Debito" ? "Débito" : "Crédito"} />}
                <ResumoLinha label={destinoLabel} value={destinoNome} />
                {tipo === "Saida" && <ResumoLinha label="Categoria" value={categoriaNome} />}
                <ResumoLinha label="Data" value={formatDataBR(dataInput)} />
                <ResumoLinha label="Status" value={statusResumo} />
                {previewParcelamento && <ResumoLinha label="Parcelamento" value={previewParcelamento.texto} />}
                {permiteRecorrente && recorrente && <ResumoLinha label="Recorrência" value="Próximos 12 meses" />}
              </>
            )}
          </dl>
        </Card>

        {state.status === "error" && (
          <p className="type-body rounded-sm bg-neg-tint px-4 py-3 text-on-neg-tint">{state.message}</p>
        )}
        {state.status === "success" && (
          <p className="type-body rounded-sm bg-brand-tint px-4 py-3 text-on-brand-tint">Lançamento salvo.</p>
        )}

        <Button type="submit" disabled={isPending || !podeSalvar} className="w-full py-3">
          {isPending ? "Salvando..." : tipo === "Transferencia" ? "Transferir" : "Salvar lançamento"}
        </Button>
      </aside>
      </div>
    </form>
  );
}
