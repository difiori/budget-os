"use server";

import { createClient } from "@/lib/supabase/server";
import { calcularVencimento } from "@/lib/domain/vencimento";
import { formatCalendarDateISO, parseCalendarDate } from "@/lib/domain/calendar-date";
import { parseCentsFromBRL } from "@/lib/domain/money";
import { gerarParcelas } from "@/lib/domain/parcelamento";
import { gerarEntradasRecorrentes, gerarSaidasRecorrentes } from "@/lib/domain/recorrencia";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import type { EntradaStatus, FormatoCompra, Pessoa, SaidaStatus } from "@/lib/domain/types";

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
  if (totalCents <= 0) {
    return { status: "error", message: "O valor precisa ser maior que zero." };
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
      const ocorrencias = gerarSaidasRecorrentes({
        nome,
        totalCents,
        data: dataCompra,
        pessoa,
        metodo: "Débito",
        status: saidaStatus,
        categoriaId,
        contaId: destinoId,
        cartaoId: null,
      }).map((ocorrencia) => ({ ...ocorrencia, editado_por: editadoPor }));
      const { error } = await supabase.from("saida").insert(ocorrencias);
      if (error) return { status: "error", message: error.message };
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
    }).map((parcela) => ({ ...parcela, editado_por: editadoPor }));
    const { error } = await supabase.from("saida").insert(parcelas);
    if (error) return { status: "error", message: error.message };
  } else if (recorrente) {
    const ocorrencias = gerarSaidasRecorrentes({
      nome,
      totalCents,
      data: dataCompra,
      pessoa,
      metodo: "Crédito",
      status: saidaStatus,
      categoriaId,
      contaId: null,
      cartaoId: destinoId,
    }).map((ocorrencia) => ({ ...ocorrencia, editado_por: editadoPor }));
    const { error } = await supabase.from("saida").insert(ocorrencias);
    if (error) return { status: "error", message: error.message };
  } else {
    const vencimento = calcularVencimento(dataCompra, "Crédito");
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
