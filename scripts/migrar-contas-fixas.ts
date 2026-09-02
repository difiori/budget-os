// Migração pontual: transforma as séries "Recorrente" já lançadas em CONTRATOS
// de conta fixa (tabela `recorrente`) e vincula as ocorrências (e o histórico
// importado do Notion com nome equivalente) via `saida.recorrente_id`.
//
//   npx tsx --env-file=.env.import scripts/migrar-contas-fixas.ts --dry-run
//   npx tsx --env-file=.env.import scripts/migrar-contas-fixas.ts --write
//
// Decisões (confirmadas com o Diego em 02/09/2026):
// - Tudo que hoje é origem 'Recorrente' vira conta fixa, EXCETO cheque especial.
// - Série que segue até >= 6 meses à frente = contrato ATIVO sem fim (foi
//   lançada como "12 meses" e continua). Série que acaba antes disso = contrato
//   ENCERRADO com fim no último mês (assinatura cancelada/trocada, ou as
//   contas do Vitor lançadas só em julho — que NÃO voltam, decisão dele).
// - Histórico importado (origem 'Manual', jan–jun) é vinculado ao contrato pelo
//   nome equivalente (com apelidos abaixo), um por mês; nunca cria ocorrência.
// - Duas ocorrências do mesmo contrato no mesmo mês: vincula a mais antiga e
//   AVISA — a outra fica para decisão manual (o índice único não permitiria).
// - Nunca apaga nem altera valores; só insere contratos e preenche recorrente_id.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.import).");
const WRITE = process.argv.includes("--write");
if (!WRITE && !process.argv.includes("--dry-run")) throw new Error("Use --dry-run ou --write.");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

/** Nome canônico por (pessoa|categoria|nome normalizado) para unir o legado
 * importado às séries lançadas depois com outro nome. */
const APELIDOS: Record<string, string> = {
  "Diego|Contas mãe|enel": "enel mãe",
  "Diego|Contas mãe|condomínio": "condomínio mãe",
  "Diego|Contas mãe|claro residencial": "claro internet / tv",
  "Vitor|Apartamento|convênio gatos": "convênio petlove",
  "Vitor|Apartamento|caixa": "caixa habitação",
  "Vitor|Assinaturas|youtube member": "youtube membership",
};
const EXCLUIR = /cheque especial/i;
const MESES_ATIVO = 6;

const HOJE = new Date();
const MES_HOJE = HOJE.getFullYear() * 12 + HOJE.getMonth();

function normalizar(nome: string): string {
  return nome.toLowerCase().replace(/\s+/g, " ").trim();
}
function mesIdx(iso: string): number {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return y * 12 + (m - 1);
}
function mesLabel(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][m - 1]}/${String(y).slice(2)}`;
}
function mesISOde(idx: number): string {
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
}
function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function moda<T>(xs: T[]): T {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function todas<T>(tabela: string, colunas: string, filtro?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(tabela).select(colunas).order("id").range(from, from + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

interface SaidaRow {
  id: string;
  nome: string;
  total_cents: number;
  data: string | null;
  vencimento: string | null;
  pessoa: "Diego" | "Vitor";
  metodo: string;
  status: string;
  origem: string;
  categoria_id: string | null;
  conta_id: string | null;
  cartao_id: string | null;
  created_at: string;
  editado_por: "Diego" | "Vitor";
  recorrente_id?: string | null;
}

async function main() {
  const colunas =
    "id, nome, total_cents, data, vencimento, pessoa, metodo, status, origem, categoria_id, conta_id, cartao_id, created_at, editado_por" +
    (WRITE ? ", recorrente_id" : "");
  const [saidas, categorias, contas, cartoes] = await Promise.all([
    todas<SaidaRow>("saida", colunas),
    todas<{ id: string; nome: string }>("categoria", "id, nome"),
    todas<{ id: string; nome: string }>("conta", "id, nome"),
    todas<{ id: string; nome: string }>("cartao", "id, nome"),
  ]);
  const catNome = new Map(categorias.map((c) => [c.id, c.nome]));
  const destino = (s: { metodo: string; conta_id: string | null; cartao_id: string | null }) =>
    s.metodo === "Débito"
      ? contas.find((c) => c.id === s.conta_id)?.nome ?? "?"
      : cartoes.find((c) => c.id === s.cartao_id)?.nome ?? "?";

  const canonico = (s: SaidaRow) => {
    const cat = catNome.get(s.categoria_id ?? "") ?? "";
    const n = normalizar(s.nome);
    return APELIDOS[`${s.pessoa}|${cat}|${n}`] ?? n;
  };

  // Séries recorrentes → grupos por pessoa + método + destino + nome canônico.
  const recorrentes = saidas.filter((s) => s.origem === "Recorrente" && !EXCLUIR.test(s.nome) && s.data);
  const grupos = new Map<string, SaidaRow[]>();
  for (const s of recorrentes) {
    const k = [s.pessoa, s.metodo, s.conta_id ?? "", s.cartao_id ?? "", canonico(s)].join("|");
    grupos.set(k, [...(grupos.get(k) ?? []), s]);
  }

  const avisos: string[] = [];
  const contratos: {
    chave: string;
    nome: string;
    pessoa: "Diego" | "Vitor";
    metodo: string;
    categoria_id: string | null;
    conta_id: string | null;
    cartao_id: string | null;
    total_cents: number;
    dia: number;
    inicioIdx: number;
    fimIdx: number | null;
    ativo: boolean;
    ocorrenciaIds: string[];
    legadoIds: string[];
    editado_por: "Diego" | "Vitor";
  }[] = [];

  for (const [chave, itens] of grupos) {
    const ordenados = [...itens].sort((a, b) => (a.data! < b.data! ? -1 : a.data! > b.data! ? 1 : a.created_at.localeCompare(b.created_at)));
    const porMes = new Map<number, SaidaRow[]>();
    for (const s of ordenados) porMes.set(mesIdx(s.data!), [...(porMes.get(mesIdx(s.data!)) ?? []), s]);
    const vinculadas: string[] = [];
    for (const [m, xs] of porMes) {
      vinculadas.push(xs[0].id);
      if (xs.length > 1) {
        avisos.push(
          `DUPLICADA em ${mesLabel(m)}: ${xs[0].pessoa} · "${xs[0].nome}" tem ${xs.length} ocorrências (${xs
            .map((x) => `${brl(x.total_cents)} dia ${x.data!.slice(8, 10)} ${x.status}`)
            .join(" | ")}). Vinculei a mais antiga; as outras ficam sem vínculo para você decidir.`
        );
      }
    }
    const meses = [...porMes.keys()].sort((a, b) => a - b);
    const inicioIdx = meses[0];
    const ultimoIdx = meses[meses.length - 1];
    const ativo = ultimoIdx - MES_HOJE >= MESES_ATIVO;
    const maisRecente = ordenados[ordenados.length - 1];
    // Valor previsto = o mais frequente da série (um mês editado à mão, como
    // uma Caixa de R$ 1.116 num mês de R$ 456, não pode virar o "normal").
    // Empate resolve pelo mais recente.
    const valorPrevisto = moda([...ordenados].reverse().map((s) => s.total_cents));
    contratos.push({
      chave,
      nome: maisRecente.nome,
      pessoa: maisRecente.pessoa,
      metodo: maisRecente.metodo,
      categoria_id: moda(ordenados.map((s) => s.categoria_id)),
      conta_id: maisRecente.conta_id,
      cartao_id: maisRecente.cartao_id,
      total_cents: valorPrevisto,
      dia: moda(ordenados.map((s) => Number(s.data!.slice(8, 10)))),
      inicioIdx,
      fimIdx: ativo ? null : ultimoIdx,
      ativo,
      ocorrenciaIds: vinculadas,
      legadoIds: [],
      editado_por: maisRecente.editado_por,
    });
  }

  // Histórico importado (Manual) com o mesmo nome canônico → vincula por mês.
  const manuais = saidas.filter((s) => s.origem === "Manual" && s.data);
  for (const c of contratos) {
    const canonDoContrato = canonico({ ...manuais[0], nome: c.nome, pessoa: c.pessoa, categoria_id: c.categoria_id } as SaidaRow);
    const mesesOcupados = new Set(c.ocorrenciaIds.map((id) => mesIdx(saidas.find((s) => s.id === id)!.data!)));
    const candidatos = manuais
      .filter((s) => s.pessoa === c.pessoa && s.categoria_id === c.categoria_id && canonico(s) === canonDoContrato)
      .sort((a, b) => (a.data! < b.data! ? -1 : 1));
    for (const s of candidatos) {
      const m = mesIdx(s.data!);
      if (mesesOcupados.has(m)) {
        avisos.push(`LEGADO sem vaga em ${mesLabel(m)}: ${s.pessoa} · "${s.nome}" ${brl(s.total_cents)} já tem ocorrência no mês — não vinculado.`);
        continue;
      }
      mesesOcupados.add(m);
      c.legadoIds.push(s.id);
      if (m < c.inicioIdx) c.inicioIdx = m;
    }
  }

  contratos.sort((a, b) => a.pessoa.localeCompare(b.pessoa) || (catNome.get(a.categoria_id ?? "") ?? "").localeCompare(catNome.get(b.categoria_id ?? "") ?? "") || a.nome.localeCompare(b.nome));

  console.log(`\n${WRITE ? "GRAVANDO" : "SIMULAÇÃO"} — ${contratos.length} contratos a partir de ${recorrentes.length} ocorrências recorrentes\n`);
  let pessoaAtual = "";
  for (const c of contratos) {
    if (c.pessoa !== pessoaAtual) {
      pessoaAtual = c.pessoa;
      console.log(`\n== ${pessoaAtual} ==`);
    }
    const vig = c.ativo ? `ATIVA desde ${mesLabel(c.inicioIdx)}` : `encerrada ${mesLabel(c.inicioIdx)}→${mesLabel(c.fimIdx!)}`;
    console.log(
      `  ${c.nome.padEnd(28)} ${(catNome.get(c.categoria_id ?? "") ?? "—").padEnd(16)} ${c.metodo.padEnd(7)} ${destino(c).padEnd(22)} ${brl(c.total_cents).padStart(12)}  dia ${String(c.dia).padStart(2)}  ${vig.padEnd(26)} ${c.ocorrenciaIds.length} ocorr.${c.legadoIds.length ? ` + ${c.legadoIds.length} legadas` : ""}`
    );
  }
  if (avisos.length) {
    console.log(`\n-- Avisos (${avisos.length}) --`);
    for (const a of avisos) console.log(`  • ${a}`);
  }
  const excluidas = saidas.filter((s) => s.origem === "Recorrente" && EXCLUIR.test(s.nome));
  if (excluidas.length) console.log(`\n-- Fora (cheque especial): ${excluidas.length} ocorrências ficam como estão.`);

  if (!WRITE) return;

  // Idempotência: não recria contrato já existente com a mesma chave (nome+pessoa).
  const { data: existentes, error: exErr } = await supabase.from("recorrente").select("id, nome, pessoa");
  if (exErr) throw new Error(exErr.message);
  const jaExiste = new Set((existentes ?? []).map((r: any) => `${r.pessoa}|${normalizar(r.nome)}`));

  let criados = 0;
  let vinculadas = 0;
  for (const c of contratos) {
    if (jaExiste.has(`${c.pessoa}|${normalizar(c.nome)}`)) {
      console.log(`  (pulado, já existe) ${c.pessoa} · ${c.nome}`);
      continue;
    }
    const { data: novo, error } = await supabase
      .from("recorrente")
      .insert({
        nome: c.nome,
        total_cents: c.total_cents,
        pessoa: c.pessoa,
        metodo: c.metodo,
        categoria_id: c.categoria_id,
        conta_id: c.conta_id,
        cartao_id: c.cartao_id,
        dia_vencimento: c.dia,
        ativo: c.ativo,
        inicio: mesISOde(c.inicioIdx),
        fim: c.fimIdx === null ? null : mesISOde(c.fimIdx),
        editado_por: c.editado_por,
      })
      .select("id")
      .single();
    if (error || !novo) throw new Error(`contrato ${c.nome}: ${error?.message}`);
    criados += 1;
    const ids = [...c.ocorrenciaIds, ...c.legadoIds];
    for (let i = 0; i < ids.length; i += 100) {
      const { error: upErr } = await supabase
        .from("saida")
        .update({ recorrente_id: novo.id })
        .in("id", ids.slice(i, i + 100))
        .is("recorrente_id", null);
      if (upErr) throw new Error(`vínculo ${c.nome}: ${upErr.message}`);
    }
    vinculadas += ids.length;
  }
  console.log(`\nOK: ${criados} contratos criados, ${vinculadas} saídas vinculadas.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
