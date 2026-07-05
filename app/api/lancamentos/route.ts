import { createAdminClient } from "@/lib/supabase/admin";
import { calcularVencimento } from "@/lib/domain/vencimento";
import { formatCalendarDateISO, hoje, parseCalendarDate } from "@/lib/domain/calendar-date";
import { formatCentsToBRL, parseCentsFromBRL } from "@/lib/domain/money";
import { gerarParcelas } from "@/lib/domain/parcelamento";
import type { Pessoa } from "@/lib/domain/types";

/**
 * API para criar lançamentos de fora da plataforma (ex.: Atalhos do iPhone).
 * Protegida por um segredo (Authorization: Bearer <SHORTCUT_API_SECRET>).
 * Reaproveita as regras de domínio (vencimento, parcelamento, débito de saldo)
 * e escreve nas mesmas tabelas — reflete na plataforma na hora.
 *
 * Corpo (JSON), campos flexíveis para simplificar o atalho:
 *   pessoa    "Diego" | "Vitor"                (obrigatório)
 *   tipo      "saida" | "entrada"              (padrão "saida")
 *   nome      string                            (obrigatório)
 *   valor     número em reais (42.9) ou "42,90" (obrigatório)
 *   metodo    "debito" | "credito"             (saída; padrão "debito")
 *   conta     nome ou id da conta               (débito/entrada)
 *   cartao    nome ou id do cartão              (crédito)
 *   categoria nome ou id                        (opcional)
 *   status    "pago"|"a_pagar"|"recebido"|"nao_recebido"
 *   data      "YYYY-MM-DD"                       (padrão: hoje em SP)
 *   parcelas  número > 1                         (crédito parcelado)
 */

function autorizado(request: Request): boolean {
  const segredo = process.env.SHORTCUT_API_SECRET;
  if (!segredo) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  // Comparação de tamanho fixo o suficiente para um app privado.
  return token.length === segredo.length && token === segredo;
}

function erro(status: number, mensagem: string) {
  return Response.json({ ok: false, error: mensagem }, { status });
}

function valorParaCents(valor: unknown): number {
  if (typeof valor === "number" && Number.isFinite(valor)) return Math.round(valor * 100);
  if (typeof valor === "string" && valor.trim()) return parseCentsFromBRL(valor);
  throw new Error("valor inválido");
}

/** Casa por id exato ou por nome (case-insensitive: exato e depois "contém"). */
function resolver<T extends { id: string; nome: string }>(itens: T[], busca: string): T | null {
  const q = busca.trim().toLowerCase();
  return (
    itens.find((i) => i.id === busca) ??
    itens.find((i) => i.nome.toLowerCase() === q) ??
    itens.find((i) => i.nome.toLowerCase().includes(q)) ??
    null
  );
}

export async function POST(request: Request) {
  if (!autorizado(request)) return erro(401, "Não autorizado.");

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return erro(400, "Corpo JSON inválido.");
  }

  const pessoa = String(corpo.pessoa ?? "");
  if (pessoa !== "Diego" && pessoa !== "Vitor") return erro(400, 'Campo "pessoa" deve ser "Diego" ou "Vitor".');
  const nome = String(corpo.nome ?? "").trim();
  if (!nome) return erro(400, 'Campo "nome" é obrigatório.');

  let totalCents: number;
  try {
    totalCents = valorParaCents(corpo.valor);
  } catch {
    return erro(400, 'Campo "valor" inválido (use número em reais ou texto "42,90").');
  }
  if (totalCents === 0) return erro(400, "O valor não pode ser zero.");

  const dataCompra = corpo.data ? parseCalendarDate(String(corpo.data)) : hoje();
  const supabase = createAdminClient();
  const tipo = String(corpo.tipo ?? "saida").toLowerCase();

  // Categorias/contas/cartões para resolver por nome.
  const [{ data: contasRaw }, { data: cartoesRaw }, { data: categoriasRaw }] = await Promise.all([
    supabase.from("conta").select("id, nome, dono"),
    supabase.from("cartao").select("id, nome, dono, conta_vinculada_id"),
    supabase.from("categoria").select("id, nome, dono"),
  ]);
  const contas = (contasRaw ?? []) as { id: string; nome: string; dono: Pessoa }[];
  const cartoes = (cartoesRaw ?? []) as { id: string; nome: string; dono: Pessoa; conta_vinculada_id: string | null }[];
  const categorias = (categoriasRaw ?? []) as { id: string; nome: string }[];

  const categoriaId = corpo.categoria ? resolver(categorias, String(corpo.categoria))?.id ?? null : null;

  // ---- ENTRADA -----------------------------------------------------------
  if (tipo === "entrada") {
    const conta = corpo.conta ? resolver(contas, String(corpo.conta)) : null;
    if (!conta) return erro(400, 'Entrada exige "conta" (nome ou id) válida.');
    const recebido = ["recebido", "pago", "true", "sim"].includes(String(corpo.status ?? "").toLowerCase());
    const status = recebido ? "Recebido" : "Não recebido";

    const { data, error } = await supabase
      .from("entrada")
      .insert({
        nome,
        quantia_cents: totalCents,
        data: formatCalendarDateISO(dataCompra),
        pessoa,
        status,
        conta_destino_id: conta.id,
        origem: "Manual",
        editado_por: pessoa,
      })
      .select("id")
      .single();
    if (error) return erro(500, error.message);

    if (recebido) {
      const { error: rpc } = await supabase.rpc("creditar_conta", { p_conta_id: conta.id, p_valor_cents: totalCents });
      if (rpc) return erro(500, `Entrada criada, mas o saldo não foi ajustado: ${rpc.message}`);
    }
    return Response.json({
      ok: true,
      id: data.id,
      resumo: `Entrada "${nome}" ${formatCentsToBRL(totalCents)} em ${conta.nome} — ${status}`,
    });
  }

  // ---- SAÍDA -------------------------------------------------------------
  const metodo = String(corpo.metodo ?? "debito").toLowerCase() === "credito" ? "Crédito" : "Débito";
  const pago = ["pago", "true", "sim"].includes(String(corpo.status ?? "").toLowerCase());
  const status = pago ? "Pago" : "A pagar";
  const parcelas = Number(corpo.parcelas ?? 1) || 1;

  if (metodo === "Crédito") {
    const cartao = corpo.cartao ? resolver(cartoes, String(corpo.cartao)) : null;
    if (!cartao) return erro(400, 'Saída no crédito exige "cartao" (nome ou id) válido.');
    const contaVinculada = cartao.conta_vinculada_id;

    if (parcelas > 1) {
      const linhas = gerarParcelas({
        nome,
        totalCents,
        numeroParcelas: parcelas,
        data: dataCompra,
        pessoa,
        metodo: "Crédito",
        status,
        cartaoId: cartao.id,
        categoriaId,
      }).map((p) => ({ ...p, editado_por: pessoa }));
      const { error } = await supabase.from("saida").insert(linhas);
      if (error) return erro(500, error.message);
    } else {
      const vencimento = calcularVencimento(dataCompra, "Crédito");
      const { error } = await supabase.from("saida").insert({
        nome,
        total_cents: totalCents,
        data: formatCalendarDateISO(dataCompra),
        vencimento: formatCalendarDateISO(vencimento),
        pessoa,
        metodo: "Crédito",
        status,
        origem: "Manual",
        categoria_id: categoriaId,
        conta_id: null,
        cartao_id: cartao.id,
        editado_por: pessoa,
      });
      if (error) return erro(500, error.message);
    }

    if (pago && contaVinculada) {
      const { error: rpc } = await supabase.rpc("debitar_conta", { p_conta_id: contaVinculada, p_valor_cents: totalCents });
      if (rpc) return erro(500, `Saída criada, mas o saldo não foi ajustado: ${rpc.message}`);
    }
    return Response.json({
      ok: true,
      resumo: `Saída "${nome}" ${formatCentsToBRL(totalCents)} no Crédito (${cartao.nome})${
        parcelas > 1 ? ` em ${parcelas}x` : ""
      } — ${status}`,
    });
  }

  // Débito
  const conta = corpo.conta ? resolver(contas, String(corpo.conta)) : null;
  if (!conta) return erro(400, 'Saída no débito exige "conta" (nome ou id) válida.');
  const vencimento = calcularVencimento(dataCompra, "Débito");
  const { data, error } = await supabase
    .from("saida")
    .insert({
      nome,
      total_cents: totalCents,
      data: formatCalendarDateISO(dataCompra),
      vencimento: formatCalendarDateISO(vencimento),
      pessoa,
      metodo: "Débito",
      status,
      origem: "Manual",
      categoria_id: categoriaId,
      conta_id: conta.id,
      cartao_id: null,
      editado_por: pessoa,
    })
    .select("id")
    .single();
  if (error) return erro(500, error.message);

  if (pago) {
    const { error: rpc } = await supabase.rpc("debitar_conta", { p_conta_id: conta.id, p_valor_cents: totalCents });
    if (rpc) return erro(500, `Saída criada, mas o saldo não foi ajustado: ${rpc.message}`);
  }
  return Response.json({
    ok: true,
    id: data.id,
    resumo: `Saída "${nome}" ${formatCentsToBRL(totalCents)} no Débito (${conta.nome}) — ${status}`,
  });
}
