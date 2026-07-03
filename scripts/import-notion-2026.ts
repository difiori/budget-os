// Importação única do histórico 2026 (Jan-Dez, Diego + Vitor) do Notion legado
// para o Supabase. Rodar sempre com --dry-run primeiro.
//
//   npx tsx --env-file=.env.import scripts/import-notion-2026.ts --dry-run
//   npx tsx --env-file=.env.import scripts/import-notion-2026.ts --write
//
// Decisões de mapeamento (confirmadas com o usuário):
// - Saída ligada só a Conta (sem cartão) não tem "Método" no legado -> "Débito".
// - Status de saída "Concluído" -> "Pago", "Em andamento" -> "A pagar".
// - Status de entrada "Solicitado"/"Nota emitida" -> "Não recebido".
// - "Data" (compra) não existe no legado -> reconstruída a partir do mês da
//   página do Notion (não do created_at — o legado foi criado em lote, com
//   muitas linhas de meses diferentes compartilhando o mesmo created_at).
// - valor_pago, comprovante, parcela: não recuperáveis de forma confiável do
//   legado (fórmulas/estrutura diferente) -> ficam null.
// - notion_page_id: fica null (reservado para o sync da F3 com a base v2).
//
// Script pontual lidando com JSON bruto da API do Notion — `any` é aceitável
// aqui, não vale a pena tipar a resposta inteira da API para uso único.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type CalendarDate,
  daysInMonth,
  formatCalendarDateISO,
  instantToCalendarDate,
} from "../lib/domain/calendar-date";
import { calcularVencimento } from "../lib/domain/vencimento";
import type { MetodoPagamento } from "../lib/domain/types";

const NOMES_MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "2026 | Agosto" -> { year: 2026, month: 8 }. */
function parseMesNome(mesNome: string): { year: number; month: number } {
  const [anoStr, nomeMes] = mesNome.split("|").map((s) => s.trim());
  const month = NOMES_MESES.indexOf(nomeMes) + 1;
  if (month === 0) throw new Error(`Mês não reconhecido: "${mesNome}"`);
  return { year: Number(anoStr), month };
}

/**
 * O legado foi criado em lote (muitas linhas de meses diferentes com o mesmo
 * `created_at`, de sessões de setup adiantado) — `created_at` não é
 * confiável pra saber o mês da transação. Usamos o mês da própria página do
 * Notion (`mesNome`, ex. "2026 | Agosto") como fonte de verdade do mês/ano,
 * mantendo só o dia do `created_at` (puramente estético, não afeta cálculo
 * de fatura/vencimento, que só olha mês).
 */
function dataCorrigida(createdAt: string, mesNome: string): CalendarDate {
  const { year, month } = parseMesNome(mesNome);
  const diaOriginal = instantToCalendarDate(createdAt).day;
  const day = Math.min(diaOriginal, daysInMonth(year, month));
  return { year, month, day };
}

const NOTION_TOKEN = requireEnv("NOTION_TOKEN");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const NOTION_VERSION = "2025-09-03";

const DIEGO_GALLERY_DATA_SOURCE = "1774c37a-7776-817b-9809-000b1522b9ec";
const VITOR_GALLERY_DATA_SOURCE = "1774c37a-7776-8185-91b9-000b2c24b004";

const DRY_RUN = !process.argv.includes("--write");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

// ---------------------------------------------------------------------------
// Notion API (raw fetch, com retry/backoff pra 429)
// ---------------------------------------------------------------------------

async function notionFetch(path: string, init?: RequestInit): Promise<any> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "2");
      await sleep((retryAfter + 1) * 1000);
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Notion API ${res.status} em ${path}: ${body}`);
    }
    return res.json();
  }
  throw new Error(`Notion API: excedeu tentativas em ${path}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryDataSourceAllRows(dataSourceId: string): Promise<any[]> {
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const page = await notionFetch(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    rows.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// ---------------------------------------------------------------------------
// Extração de propriedades Notion
// ---------------------------------------------------------------------------

// O legado não é uniforme entre pessoas/meses: nomes de propriedade mudam de
// capitalização ("Conta destino" vs "Conta Destino") ou até de idioma ("Nome"
// vs "Name"). Toda leitura de propriedade é case-insensitive por segurança.
function getProp(page: any, name: string): any {
  const key = Object.keys(page.properties).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? page.properties[key] : undefined;
}

// A propriedade-título é encontrada pelo *tipo* ("title"), não pelo nome —
// toda base Notion tem exatamente uma, então isso é imune a Nome/Name.
function propTitle(page: any): string {
  const entry = Object.values(page.properties).find((p: any) => p?.type === "title") as any;
  const rich = entry?.title ?? [];
  return rich.map((r: any) => r.plain_text).join("").trim();
}

function propRichText(page: any, name: string): string | null {
  const rich = getProp(page, name)?.rich_text ?? [];
  const text = rich.map((r: any) => r.plain_text).join("").trim();
  return text || null;
}

function propNumber(page: any, name: string): number | null {
  return getProp(page, name)?.number ?? null;
}

function propStatus(page: any, name: string): string | null {
  return getProp(page, name)?.status?.name ?? null;
}

function propDate(page: any, name: string): string | null {
  return getProp(page, name)?.date?.start ?? null;
}

function propCreatedTime(page: any, name: string): string {
  const value = getProp(page, name)?.created_time;
  if (!value) throw new Error(`Propriedade created_time "${name}" ausente`);
  return value;
}

function propRelationIds(page: any, name: string): string[] {
  const relation = getProp(page, name)?.relation ?? [];
  return relation.map((r: any) => r.id);
}

// ---------------------------------------------------------------------------
// Descoberta das bases legadas embutidas em cada página de mês
// ---------------------------------------------------------------------------

interface MonthDatabases {
  saidas: string;
  entradas: string;
  transferencias: string;
  contas: string;
  cartoes: string;
  categorias: string;
}

async function discoverMonthDatabases(pageId: string): Promise<MonthDatabases> {
  const children = await notionFetch(`/blocks/${pageId}/children?page_size=100`);
  const toggle = children.results.find((b: any) => b.type === "toggle");
  if (!toggle) throw new Error(`Toggle "Banco de Dados" não encontrado em ${pageId}`);

  const toggleChildren = await notionFetch(`/blocks/${toggle.id}/children?page_size=100`);
  const dbBlocks = toggleChildren.results.filter((b: any) => b.type === "child_database");

  const byTitle: Record<string, string> = {};
  for (const block of dbBlocks) {
    const db = await notionFetch(`/databases/${block.id}`);
    const dataSourceId = db.data_sources[0].id;
    byTitle[block.child_database.title] = dataSourceId;
  }

  const required: Array<[keyof MonthDatabases, string]> = [
    ["saidas", "Saídas"],
    ["entradas", "Entradas"],
    ["transferencias", "Transferências"],
    ["contas", "Contas Bancárias"],
    ["cartoes", "Cartões de Crédito"],
    ["categorias", "Categorias"],
  ];
  const result = {} as MonthDatabases;
  for (const [key, title] of required) {
    const id = byTitle[title];
    if (!id) throw new Error(`Base "${title}" não encontrada em ${pageId}`);
    result[key] = id;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Mapas de referência
// ---------------------------------------------------------------------------

async function listMonthPages(gallerySourceId: string): Promise<Array<{ id: string; nome: string }>> {
  const rows = await queryDataSourceAllRows(gallerySourceId);
  return rows
    .map((page) => ({ id: page.id, nome: propTitle(page) }))
    .filter((p) => p.nome.startsWith("2026"))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Nome -> id do legado, pra uma base (Contas/Cartões/Categorias) de UM mês específico. */
async function buildLegacyNameMap(dataSourceId: string): Promise<Map<string, string>> {
  const rows = await queryDataSourceAllRows(dataSourceId);
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(propTitle(row), row.id);
  }
  return map;
}

function stripCartaoPrefix(nome: string): string {
  return nome.startsWith("Cartão ") ? nome.slice("Cartão ".length) : nome;
}

interface SupabaseRefMaps {
  contaIdByNome: Map<string, string>;
  cartaoIdByNome: Map<string, string>;
  categoriaIdByNome: Map<string, string>;
}

async function buildSupabaseRefMaps(supabase: SupabaseClient<any>): Promise<SupabaseRefMaps> {
  const [{ data: contas, error: e1 }, { data: cartoes, error: e2 }, { data: categorias, error: e3 }] =
    await Promise.all([
      supabase.from("conta").select("id, nome"),
      supabase.from("cartao").select("id, nome"),
      supabase.from("categoria").select("id, nome"),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  return {
    contaIdByNome: new Map((contas ?? []).map((c: any) => [c.nome, c.id])),
    cartaoIdByNome: new Map((cartoes ?? []).map((c: any) => [c.nome, c.id])),
    categoriaIdByNome: new Map((categorias ?? []).map((c: any) => [c.nome, c.id])),
  };
}

// ---------------------------------------------------------------------------
// Mapeamento de status
// ---------------------------------------------------------------------------

const SAIDA_STATUS_MAP: Record<string, string> = {
  "A pagar": "A pagar",
  Pago: "Pago",
  Faturado: "Faturado",
  Fixo: "Fixo",
  "Em processamento": "Em processamento",
  Concluído: "Pago",
  "Em andamento": "A pagar",
};

const ENTRADA_STATUS_MAP: Record<string, string> = {
  "Não recebido": "Não recebido",
  Recebido: "Recebido",
  "Em conta": "Em conta",
  Solicitado: "Não recebido",
  "Nota emitida": "Não recebido",
};

// ---------------------------------------------------------------------------
// Processamento de um mês
// ---------------------------------------------------------------------------

interface MonthSummary {
  pessoa: string;
  mes: string;
  saidasCount: number;
  saidasTotalCents: number;
  entradasCount: number;
  entradasTotalCents: number;
  transferenciasCount: number;
  avisos: string[];
}

async function processMonth(
  supabase: SupabaseClient<any>,
  pessoa: "Diego" | "Vitor",
  pageId: string,
  mesNome: string,
  refMaps: SupabaseRefMaps
): Promise<MonthSummary> {
  const avisos: string[] = [];
  const dbs = await discoverMonthDatabases(pageId);

  const [contasMap, cartoesMap, categoriasMap] = await Promise.all([
    buildLegacyNameMap(dbs.contas),
    buildLegacyNameMap(dbs.cartoes),
    buildLegacyNameMap(dbs.categorias),
  ]);
  const contaIdByLegacyId = new Map<string, string>();
  for (const [nome, legacyId] of contasMap) {
    const localId = refMaps.contaIdByNome.get(nome);
    if (localId) contaIdByLegacyId.set(legacyId, localId);
  }
  const cartaoIdByLegacyId = new Map<string, string>();
  for (const [nome, legacyId] of cartoesMap) {
    const localId = refMaps.cartaoIdByNome.get(stripCartaoPrefix(nome));
    if (localId) cartaoIdByLegacyId.set(legacyId, localId);
  }
  const categoriaIdByLegacyId = new Map<string, string>();
  for (const [nome, legacyId] of categoriasMap) {
    const localId = refMaps.categoriaIdByNome.get(nome);
    if (localId) categoriaIdByLegacyId.set(legacyId, localId);
  }

  // ---- Saídas ----
  const saidaRows = await queryDataSourceAllRows(dbs.saidas);
  const saidaInserts: Record<string, unknown>[] = [];
  for (const row of saidaRows) {
    const nome = propTitle(row);
    const totalReais = propNumber(row, "Total");
    if (totalReais === null) {
      avisos.push(`Saída "${nome}" sem Total, pulada`);
      continue;
    }
    const cartaoCreditoIds = propRelationIds(row, "Cartão de Crédito");
    const cartaoPluxeeIds = propRelationIds(row, "Cartão Pluxee");
    const contaIds = propRelationIds(row, "Conta");

    let cartaoLocalId: string | null = null;
    let contaLocalId: string | null = null;
    let metodo = "Débito";
    if (cartaoCreditoIds.length > 0) {
      cartaoLocalId = cartaoIdByLegacyId.get(cartaoCreditoIds[0]) ?? null;
      metodo = "Crédito";
    } else if (cartaoPluxeeIds.length > 0) {
      cartaoLocalId = cartaoIdByLegacyId.get(cartaoPluxeeIds[0]) ?? null;
      metodo = "Pluxee";
    } else if (contaIds.length > 0) {
      contaLocalId = contaIdByLegacyId.get(contaIds[0]) ?? null;
      metodo = "Débito";
    }
    if (!cartaoLocalId && !contaLocalId) {
      avisos.push(`Saída "${nome}" sem conta/cartão resolvido, pulada`);
      continue;
    }

    const categoriaIds = propRelationIds(row, "Categoria");
    const categoriaLocalId = categoriaIds.length > 0 ? categoriaIdByLegacyId.get(categoriaIds[0]) ?? null : null;
    if (categoriaIds.length > 0 && !categoriaLocalId) {
      avisos.push(`Saída "${nome}": categoria não resolvida`);
    }

    const legacyStatus = propStatus(row, "Status") ?? "A pagar";
    const status = SAIDA_STATUS_MAP[legacyStatus];
    if (!status) {
      avisos.push(`Saída "${nome}": status "${legacyStatus}" desconhecido, pulada`);
      continue;
    }

    // Vencimento sempre recalculado pela regra 7 (regra alvo), não copiado do
    // Notion: o legado computava vencimento = data (regra antiga) e às vezes
    // vinha nulo. `data` é reconstruída a partir do mês da página (ver
    // dataCorrigida) porque created_at não reflete o mês real da transação.
    const createdAt = propCreatedTime(row, "Data criada");
    const dataEfetiva = dataCorrigida(createdAt, mesNome);
    const vencimentoCalc = calcularVencimento(dataEfetiva, metodo as MetodoPagamento);

    saidaInserts.push({
      nome,
      total_cents: Math.round(totalReais * 100),
      data: formatCalendarDateISO(dataEfetiva),
      vencimento: formatCalendarDateISO(vencimentoCalc),
      pessoa,
      metodo,
      status,
      origem: "Manual",
      categoria_id: categoriaLocalId,
      conta_id: contaLocalId,
      cartao_id: cartaoLocalId,
      parcela: null,
      valor_pago_cents: null,
      comprovante: null,
      notion_page_id: null,
      created_at: createdAt,
    });
  }

  // ---- Entradas ----
  const entradaRows = await queryDataSourceAllRows(dbs.entradas);
  const entradaInserts: Record<string, unknown>[] = [];
  for (const row of entradaRows) {
    const nome = propTitle(row);
    const quantia = propNumber(row, "Quantia");
    if (quantia === null) {
      avisos.push(`Entrada "${nome}" sem Quantia, pulada`);
      continue;
    }
    const contaDestinoIds = propRelationIds(row, "Conta destino");
    const contaLocalId = contaDestinoIds.length > 0 ? contaIdByLegacyId.get(contaDestinoIds[0]) ?? null : null;
    if (!contaLocalId) {
      avisos.push(`Entrada "${nome}" sem conta destino resolvida, pulada`);
      continue;
    }
    const legacyStatus = propStatus(row, "Status") ?? "Não recebido";
    const status = ENTRADA_STATUS_MAP[legacyStatus];
    if (!status) {
      avisos.push(`Entrada "${nome}": status "${legacyStatus}" desconhecido, pulada`);
      continue;
    }
    const data = propDate(row, "Data");
    const createdAtEntrada = propCreatedTime(row, "Created time");

    entradaInserts.push({
      nome,
      quantia_cents: Math.round(quantia * 100),
      valor_recebido_cents: null,
      data: data ?? formatCalendarDateISO(dataCorrigida(createdAtEntrada, mesNome)),
      pessoa,
      status,
      conta_destino_id: contaLocalId,
      notas: propRichText(row, "Notas"),
      notion_page_id: null,
      created_at: createdAtEntrada,
    });
  }

  // ---- Transferências ----
  const transferenciaRows = await queryDataSourceAllRows(dbs.transferencias);
  const transferenciaInserts: Record<string, unknown>[] = [];
  for (const row of transferenciaRows) {
    const nome = propTitle(row) || "Transferência";
    const valor = propNumber(row, "Valor");
    if (valor === null) continue;
    const deIds = propRelationIds(row, "De");
    const paraIds = propRelationIds(row, "Para");
    const deLocalId = deIds.length > 0 ? contaIdByLegacyId.get(deIds[0]) ?? null : null;
    const paraLocalId = paraIds.length > 0 ? contaIdByLegacyId.get(paraIds[0]) ?? null : null;
    if (!deLocalId || !paraLocalId || deLocalId === paraLocalId) {
      avisos.push(`Transferência "${nome}" com contas inválidas, pulada`);
      continue;
    }
    const data = propDate(row, "Data");
    const createdAtTransferencia = propCreatedTime(row, "Data criada");
    transferenciaInserts.push({
      nome,
      valor_cents: Math.round(valor * 100),
      data: data ?? formatCalendarDateISO(dataCorrigida(createdAtTransferencia, mesNome)),
      pessoa,
      de_conta_id: deLocalId,
      para_conta_id: paraLocalId,
      notion_page_id: null,
      created_at: createdAtTransferencia,
    });
  }

  if (!DRY_RUN) {
    if (saidaInserts.length > 0) {
      const { error } = await supabase.from("saida").insert(saidaInserts);
      if (error) throw new Error(`Insert saida (${pessoa} ${mesNome}): ${error.message}`);
    }
    if (entradaInserts.length > 0) {
      const { error } = await supabase.from("entrada").insert(entradaInserts);
      if (error) throw new Error(`Insert entrada (${pessoa} ${mesNome}): ${error.message}`);
    }
    if (transferenciaInserts.length > 0) {
      const { error } = await supabase.from("transferencia").insert(transferenciaInserts);
      if (error) throw new Error(`Insert transferencia (${pessoa} ${mesNome}): ${error.message}`);
    }
  }

  return {
    pessoa,
    mes: mesNome,
    saidasCount: saidaInserts.length,
    saidasTotalCents: saidaInserts.reduce((s, r) => s + (r.total_cents as number), 0),
    entradasCount: entradaInserts.length,
    entradasTotalCents: entradaInserts.reduce((s, r) => s + (r.quantia_cents as number), 0),
    transferenciasCount: transferenciaInserts.length,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN (nada será gravado) ===" : "=== GRAVANDO NO SUPABASE ===");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const refMaps = await buildSupabaseRefMaps(supabase);

  const [diegoMonths, vitorMonths] = await Promise.all([
    listMonthPages(DIEGO_GALLERY_DATA_SOURCE),
    listMonthPages(VITOR_GALLERY_DATA_SOURCE),
  ]);

  // Filtro opcional pra retry pontual de um mês que falhou por erro
  // transiente, sem reprocessar (e duplicar) os meses que já gravaram.
  const somentePessoa = process.env.SOMENTE_PESSOA;
  const somenteMes = process.env.SOMENTE_MES;

  const summaries: MonthSummary[] = [];
  for (const [pessoa, months] of [
    ["Diego", diegoMonths],
    ["Vitor", vitorMonths],
  ] as const) {
    if (somentePessoa && pessoa !== somentePessoa) continue;
    for (const month of months) {
      if (somenteMes && month.nome !== somenteMes) continue;
      process.stdout.write(`Processando ${pessoa} — ${month.nome}... `);
      try {
        const summary = await processMonth(supabase, pessoa, month.id, month.nome, refMaps);
        summaries.push(summary);
        console.log(`ok (${summary.saidasCount} saídas, ${summary.entradasCount} entradas, ${summary.transferenciasCount} transferências)`);
      } catch (err) {
        console.log("FALHOU");
        console.error(err);
      }
    }
  }

  console.log("\n=== Resumo por mês ===");
  let totalSaidasCents = 0;
  let totalEntradasCents = 0;
  const avisos: string[] = [];
  for (const s of summaries) {
    console.log(
      `${s.pessoa} ${s.mes}: ${s.saidasCount} saídas (${formatCents(s.saidasTotalCents)}) | ` +
        `${s.entradasCount} entradas (${formatCents(s.entradasTotalCents)}) | ${s.transferenciasCount} transferências`
    );
    totalSaidasCents += s.saidasTotalCents;
    totalEntradasCents += s.entradasTotalCents;
    avisos.push(...s.avisos.map((a) => `[${s.pessoa} ${s.mes}] ${a}`));
  }
  console.log(`\nTotal saídas 2026: ${formatCents(totalSaidasCents)}`);
  console.log(`Total entradas 2026: ${formatCents(totalEntradasCents)}`);

  if (avisos.length > 0) {
    console.log(`\n=== Avisos (${avisos.length}) ===`);
    avisos.forEach((a) => console.log(`- ${a}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
