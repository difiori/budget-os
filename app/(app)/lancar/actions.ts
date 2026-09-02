"use server";

import { createClient } from "@/lib/supabase/server";
import { calcularVencimento } from "@/lib/domain/vencimento";
import { formatCalendarDateISO, parseCalendarDate } from "@/lib/domain/calendar-date";
import { parseCentsFromBRL } from "@/lib/domain/money";
import { gerarParcelas } from "@/lib/domain/parcelamento";
import { gerarEntradasRecorrentes } from "@/lib/domain/recorrencia";
import { nomeSemParcela } from "@/lib/domain/parcelamento";
import { mesISO } from "@/lib/domain/conta-fixa";
import { cicloDoCartao, type CicloCartao } from "@/lib/domain/ciclo-cartao";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import type { EntradaStatus, FormatoCompra, MetodoPagamento, Pessoa, SaidaStatus } from "@/lib/domain/types";

export interface CriarLancamentoState {
  status: "idle" | "success" | "error";
  message?: string;
}

type Tipo = "Entrada" | "Saida" | "Transferencia";

export async function criarLancamento(
  _prevState: CriarLancamentoState,
  formData: FormData
): Promise<CriarLancamentoState> {
  const tipo = String(formData.get("tipo") ?? "") as Tipo;
  const modo = String(formData.get("modo") ?? "") as "Debito" | "Credito";
  const nome = String(formData.get("nome") ?? "").trim();
  const valorInput = String(formData.get("valor") ?? "").trim();
  const destinoId = String(formData.get("destinoId") ?? "");
  const categoriaId = String(formData.get("categoriaId") ?? "") || null;
  const dataInput = String(formData.get("data") ?? "");
  const status = String(formData.get("status") ?? "");
  const pessoa = String(formData.get("pessoa") ?? "") as Pessoa;
  const recorrente = String(formData.get("recorrente") ?? "") === "true";

  if (tipo === "Transferencia") {
    return criarTransferencia(formData);
  }

  if (!nome) return { status: "error", message: "Informe o nome do lançamento." };
  if (!destinoId) {
    return {
      status: "error",
      message: tipo === "Entrada" ? "Selecione a conta." : modo === "Credito" ? "Selecione o cartão." : "Selecione a conta.",
    };
  }
  if (!dataInput) return { status: "error", message: "Informe a data." };
  if (tipo === "Saida" && !categoriaId) return { status: "error", message: "Selecione a categoria." };

  let totalCents: number;
  try {
    totalCents = parseCentsFromBRL(valorInput);
  } catch {
    return { status: "error", message: "Valor inválido." };
  }
  // Negativo é permitido (ex.: adiantar/abater um pagamento); só zero não faz sentido.
  if (totalCents === 0) {
    return { status: "error", message: "O valor não pode ser zero." };
  }

  const dataCompra = parseCalendarDate(dataInput);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const editadoPor = pessoaPorEmail(user?.email);
  if (!editadoPor) {
    return { status: "error", message: "Não foi possível identificar quem está editando." };
  }

  if (tipo === "Entrada") {
    const entradaStatus = status as EntradaStatus;

    if (recorrente) {
      const ocorrencias = gerarEntradasRecorrentes({
        nome,
        quantiaCents: totalCents,
        data: dataCompra,
        pessoa,
        status: entradaStatus,
        contaDestinoId: destinoId,
      }).map((ocorrencia) => ({ ...ocorrencia, editado_por: editadoPor }));
      const { error } = await supabase.from("entrada").insert(ocorrencias);
      if (error) return { status: "error", message: error.message };
    } else {
      const { error } = await supabase.from("entrada").insert({
        nome,
        quantia_cents: totalCents,
        data: formatCalendarDateISO(dataCompra),
        pessoa,
        status: entradaStatus,
        conta_destino_id: destinoId,
        origem: "Manual",
        editado_por: editadoPor,
      });
      if (error) return { status: "error", message: error.message };
    }

    if (entradaStatus === "Recebido") {
      const { error: creditoError } = await supabase.rpc("creditar_conta", {
        p_conta_id: destinoId,
        p_valor_cents: totalCents,
      });
      if (creditoError) {
        return {
          status: "error",
          message: `Lançamento salvo, mas o saldo da conta não foi atualizado: ${creditoError.message}`,
        };
      }
    }

    return { status: "success" };
  }

  const saidaStatus = status as SaidaStatus;

  if (modo === "Debito") {
    if (recorrente) {
      const erro = await criarContaFixaComPrimeiraOcorrencia(supabase, {
        nome,
        totalCents,
        data: dataCompra,
        pessoa,
        metodo: "Débito",
        status: saidaStatus,
        categoriaId,
        contaId: destinoId,
        cartaoId: null,
        editadoPor,
      });
      if (erro) return { status: "error", message: erro };
    } else {
      const vencimento = calcularVencimento(dataCompra, "Débito");
      const { error } = await supabase.from("saida").insert({
        nome,
        total_cents: totalCents,
        data: formatCalendarDateISO(dataCompra),
        vencimento: formatCalendarDateISO(vencimento),
        pessoa,
        metodo: "Débito",
        status: saidaStatus,
        origem: "Manual",
        categoria_id: categoriaId,
        conta_id: destinoId,
        cartao_id: null,
        editado_por: editadoPor,
      });
      if (error) return { status: "error", message: error.message };
    }

    if (saidaStatus === "Pago") {
      const { error: debitoError } = await supabase.rpc("debitar_conta", {
        p_conta_id: destinoId,
        p_valor_cents: totalCents,
      });
      if (debitoError) {
        return {
          status: "error",
          message: `Lançamento salvo, mas o saldo da conta não foi atualizado: ${debitoError.message}`,
        };
      }
    }

    return { status: "success" };
  }

  // modo === "Credito"
  const formato = String(formData.get("formato") ?? "À vista") as FormatoCompra;
  const numeroParcelas = formato === "Parcelado" ? Number(formData.get("numeroParcelas") ?? "2") || 2 : 1;
  const contaVinculadaId = String(formData.get("contaVinculadaId") ?? "") || null;

  // Ciclo real do cartão (fechamento/vencimento) decide a fatura e o vencimento.
  const { data: cartaoSel } = await supabase
    .from("cartao")
    .select("dia_fechamento, dia_vencimento")
    .eq("id", destinoId)
    .single();
  const ciclo = cicloDoCartao(cartaoSel as { dia_fechamento: number; dia_vencimento: number } | null);

  if (numeroParcelas > 1) {
    const parcelas = gerarParcelas({
      nome,
      totalCents,
      numeroParcelas,
      data: dataCompra,
      pessoa,
      metodo: "Crédito",
      status: saidaStatus,
      cartaoId: destinoId,
      categoriaId,
      ciclo,
    }).map((parcela) => ({ ...parcela, editado_por: editadoPor }));
    const { error } = await supabase.from("saida").insert(parcelas);
    if (error) return { status: "error", message: error.message };
  } else if (recorrente) {
    const erro = await criarContaFixaComPrimeiraOcorrencia(supabase, {
      nome,
      totalCents,
      data: dataCompra,
      pessoa,
      metodo: "Crédito",
      status: saidaStatus,
      categoriaId,
      contaId: null,
      cartaoId: destinoId,
      editadoPor,
      ciclo,
    });
    if (erro) return { status: "error", message: erro };
  } else {
    const vencimento = calcularVencimento(dataCompra, "Crédito", ciclo);
    const { error } = await supabase.from("saida").insert({
      nome,
      total_cents: totalCents,
      data: formatCalendarDateISO(dataCompra),
      vencimento: formatCalendarDateISO(vencimento),
      pessoa,
      metodo: "Crédito",
      status: saidaStatus,
      origem: "Manual",
      categoria_id: categoriaId,
      conta_id: null,
      cartao_id: destinoId,
      editado_por: editadoPor,
    });
    if (error) return { status: "error", message: error.message };
  }

  if (saidaStatus === "Pago" && contaVinculadaId) {
    const { error: debitoError } = await supabase.rpc("debitar_conta", {
      p_conta_id: contaVinculadaId,
      p_valor_cents: totalCents,
    });
    if (debitoError) {
      return {
        status: "error",
        message: `Lançamento salvo, mas o saldo da conta vinculada não foi atualizado: ${debitoError.message}`,
      };
    }
  }

  return { status: "success" };
}

/**
 * Saída marcada como conta fixa: cria o CONTRATO (tabela `recorrente`) e só a
 * ocorrência deste mês. Os meses seguintes são materializados quando alguém
 * abre o mês (garantir_ocorrencias_contas_fixas) — nada é gerado às cegas.
 * Retorna a mensagem de erro, ou null.
 */
async function criarContaFixaComPrimeiraOcorrencia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  p: {
    nome: string;
    totalCents: number;
    data: ReturnType<typeof parseCalendarDate>;
    pessoa: Pessoa;
    metodo: MetodoPagamento;
    status: SaidaStatus;
    categoriaId: string | null;
    contaId: string | null;
    cartaoId: string | null;
    editadoPor: Pessoa;
    ciclo?: CicloCartao;
  }
): Promise<string | null> {
  const { data: contrato, error } = await supabase
    .from("recorrente")
    .insert({
      nome: p.nome,
      total_cents: p.totalCents,
      pessoa: p.pessoa,
      metodo: p.metodo,
      categoria_id: p.categoriaId,
      conta_id: p.contaId,
      cartao_id: p.cartaoId,
      dia_vencimento: p.data.day,
      inicio: mesISO(p.data),
      fim: null,
      ativo: true,
      editado_por: p.editadoPor,
    })
    .select("id")
    .single();
  if (error || !contrato) return error?.message ?? "Não foi possível criar a conta fixa.";

  const vencimento = calcularVencimento(p.data, p.metodo, p.ciclo);
  const { error: ocErr } = await supabase.from("saida").insert({
    nome: p.nome,
    total_cents: p.totalCents,
    data: formatCalendarDateISO(p.data),
    vencimento: formatCalendarDateISO(vencimento),
    pessoa: p.pessoa,
    metodo: p.metodo,
    status: p.status,
    origem: "Recorrente",
    categoria_id: p.categoriaId,
    conta_id: p.contaId,
    cartao_id: p.cartaoId,
    recorrente_id: contrato.id,
    editado_por: p.editadoPor,
  });
  return ocErr?.message ?? null;
}

/**
 * Transferência entre contas: move saldo de uma conta para outra sem contar
 * como receita nem despesa. Como o app não tem transação multi-statement
 * exposta, debita a origem e credita o destino em duas chamadas; se a segunda
 * falhar, reverte a primeira para não sumir dinheiro.
 */
async function criarTransferencia(formData: FormData): Promise<CriarLancamentoState> {
  const nome = String(formData.get("nome") ?? "").trim();
  const valorInput = String(formData.get("valor") ?? "").trim();
  const deContaId = String(formData.get("deContaId") ?? "");
  const paraContaId = String(formData.get("paraContaId") ?? "");
  const dataInput = String(formData.get("data") ?? "");
  const pessoa = String(formData.get("pessoa") ?? "") as Pessoa;

  if (!nome) return { status: "error", message: "Descreva a transferência (ex.: “reserva de viagem”)." };
  if (!deContaId) return { status: "error", message: "Selecione a conta de origem." };
  if (!paraContaId) return { status: "error", message: "Selecione a conta de destino." };
  if (deContaId === paraContaId) {
    return { status: "error", message: "Origem e destino precisam ser contas diferentes." };
  }
  if (!dataInput) return { status: "error", message: "Informe a data." };

  let valorCents: number;
  try {
    valorCents = parseCentsFromBRL(valorInput);
  } catch {
    return { status: "error", message: "Valor inválido." };
  }
  if (valorCents <= 0) return { status: "error", message: "O valor precisa ser maior que zero." };

  const dataTransferencia = parseCalendarDate(dataInput);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const editadoPor = pessoaPorEmail(user?.email);
  if (!editadoPor) return { status: "error", message: "Não foi possível identificar quem está editando." };

  // pessoa = dono da conta de origem; se o form não mandou, cai no editor.
  const pessoaTransferencia: Pessoa = pessoa === "Diego" || pessoa === "Vitor" ? pessoa : editadoPor;

  const { error: insertError } = await supabase.from("transferencia").insert({
    nome,
    valor_cents: valorCents,
    data: formatCalendarDateISO(dataTransferencia),
    pessoa: pessoaTransferencia,
    de_conta_id: deContaId,
    para_conta_id: paraContaId,
    editado_por: editadoPor,
  });
  if (insertError) return { status: "error", message: insertError.message };

  const { error: saldoError } = await supabase.rpc("transferir_entre_contas", {
    p_de_conta_id: deContaId,
    p_para_conta_id: paraContaId,
    p_valor_cents: valorCents,
  });
  if (saldoError) {
    return { status: "error", message: `Transferência salva, mas o saldo não foi movido: ${saldoError.message}` };
  }

  return { status: "success" };
}


/* ------------------------------------------------------------------------ */
/* Sugestões para o autocompletar do Lançar                                  */
/* ------------------------------------------------------------------------ */

export interface SugestaoSaida {
  nome: string;
  pessoa: Pessoa;
  categoria_id: string | null;
  metodo: MetodoPagamento;
  conta_id: string | null;
  cartao_id: string | null;
  /** Valor do lançamento mais recente com esse nome. */
  total_cents: number;
  vezes: number;
}

export interface SugestaoEntrada {
  nome: string;
  pessoa: Pessoa;
  conta_destino_id: string;
  quantia_cents: number;
  vezes: number;
}

export interface Sugestoes {
  saidas: SugestaoSaida[];
  entradas: SugestaoEntrada[];
}

/**
 * Nomes já usados, um por (pessoa, nome), com categoria/método/destino do
 * lançamento mais recente e quantas vezes apareceu. Carregado uma vez quando
 * o overlay de Lançar abre. Ocorrências de conta fixa e parcelas ficam de
 * fora (têm fluxo próprio) — a parcela entra pelo nome base.
 */
export async function carregarSugestoes(): Promise<Sugestoes> {
  const supabase = await createClient();
  const [{ data: saidas }, { data: entradas }] = await Promise.all([
    supabase
      .from("saida")
      .select("nome, pessoa, categoria_id, metodo, conta_id, cartao_id, total_cents, parcela, recorrente_id")
      .order("created_at", { ascending: false })
      .limit(800),
    supabase
      .from("entrada")
      .select("nome, pessoa, conta_destino_id, quantia_cents")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const chave = (pessoa: string, nome: string) => `${pessoa}|${nome.trim().toLowerCase().replace(/\s+/g, " ")}`;

  const porSaida = new Map<string, SugestaoSaida>();
  for (const s of (saidas ?? []) as (SugestaoSaida & { parcela: string | null; recorrente_id: string | null })[]) {
    if (s.recorrente_id) continue;
    if (s.metodo !== "Débito" && s.metodo !== "Crédito") continue;
    const nome = nomeSemParcela(s.nome, s.parcela).trim();
    if (!nome) continue;
    const k = chave(s.pessoa, nome);
    const atual = porSaida.get(k);
    if (atual) atual.vezes += 1;
    else
      porSaida.set(k, {
        nome,
        pessoa: s.pessoa,
        categoria_id: s.categoria_id,
        metodo: s.metodo,
        conta_id: s.conta_id,
        cartao_id: s.cartao_id,
        total_cents: s.total_cents,
        vezes: 1,
      });
  }

  const porEntrada = new Map<string, SugestaoEntrada>();
  for (const e of (entradas ?? []) as SugestaoEntrada[]) {
    const nome = e.nome.trim();
    if (!nome) continue;
    const k = chave(e.pessoa, nome);
    const atual = porEntrada.get(k);
    if (atual) atual.vezes += 1;
    else porEntrada.set(k, { nome, pessoa: e.pessoa, conta_destino_id: e.conta_destino_id, quantia_cents: e.quantia_cents, vezes: 1 });
  }

  return { saidas: [...porSaida.values()], entradas: [...porEntrada.values()] };
}
