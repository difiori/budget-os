// Reorganização de categorias (decidida com o Diego em 03/09/2026): cria as
// categorias novas e reclassifica as saídas de jun/2026 em diante (inclusive
// ocorrências futuras de contas fixas) e os contratos em `recorrente`.
//
//   npx tsx --env-file=.env.import scripts/reclassificar-categorias-2026-09.ts --dry-run
//   npx tsx --env-file=.env.import scripts/reclassificar-categorias-2026-09.ts --write
//
// Princípio: tira lançamentos de "Gastos Diversos" e de categorias claramente
// erradas; NÃO sobrescreve escolhas específicas já feitas (ex.: Amazon marcada
// como Pets continua Pets). Nunca apaga nem altera valores.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@supabase/supabase-js";
import { nomeSemParcela } from "@/lib/domain/parcelamento";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.import).");
const WRITE = process.argv.includes("--write");
if (!WRITE && !process.argv.includes("--dry-run")) throw new Error("Use --dry-run ou --write.");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const NOVAS = ["Weed", "Tabacaria", "Investimentos", "Reforma", "Delivery e restaurantes", "Ajustes", "Impressão 3D"];

type Linha = { nome: string; pessoa: string; catAtual: string; fixa: boolean };
type Regra = { para: string; quando: (l: Linha) => boolean };
const nomes = (...xs: string[]) => new Set(xs);
const em = (set: Set<string>) => (l: Linha) => set.has(l.nome);
const GD = "Gastos Diversos";

const REGRAS: Regra[] = [
  { para: "Weed", quando: (l) => /gan\s*gan|weed/i.test(l.nome) },
  { para: "Tabacaria", quando: em(nomes("pod eclipse", "pod", "pod descartável", "nicsalts", "tabacos", "cigarro", "tabacaria", "white cloud")) },
  { para: "Investimentos", quando: em(nomes("investimento", "investimento nubank")) },
  {
    para: "Reforma",
    quando: em(
      nomes("tinta apartamento", "tintas apartamento", "tinta", "tintas teste suvinil", "tinta teste suvinil", "mercado livre (reforma)", "aliexpress (fechadura)", "ferramentas", "materiais de construção", "reforma", "cameras")
    ),
  },
  // iFood do Vitor marcado como Assinaturas (Clube iFood, conta fixa ou não) fica onde está.
  { para: "Delivery e restaurantes", quando: (l) => em(nomes("ifood", "keeta", "99 food", "mcdonalds", "mc donalds", "mestre pizza", "restaurante", "bacio di latte", "sorveteria", "pastel"))(l) && !(l.nome === "ifood" && (l.fixa || l.catAtual === "Assinaturas")) },
  { para: "Ajustes", quando: em(nomes("diferença", "diferenças de agosto", "fatura anterior", "adiantamento", "entrada cartão momo", "pix momo")) },
  { para: "Impressão 3D", quando: em(nomes("filamentos")) },
  // Compras de produto: só o que está em Gastos Diversos (ou claramente errado) vai para Shopping.
  { para: "Shopping", quando: (l) => em(nomes("amazon", "mercado livre", "aliexpress", "shopee", "netshoes", "chico rei", "camiseta mayhem", "grudado", "película iphone", "akitem", "apple"))(l) && l.catAtual === GD },
  { para: "Shopping", quando: (l) => l.nome === "camiseta cápsula" },
  { para: "Pets", quando: (l) => em(nomes("ração gatos", "areia gatos", "convênio gatos", "convênio petlove", "queranon gatos", "petiscos", "pet shop", "petshop", "petz"))(l) && l.catAtual !== "Pets" },
  { para: "Empréstimos", quando: em(nomes("empréstimo mepa", "renegociação cheque especial 09/24", "parcelamento")) },
  { para: "Saúde", quando: (l) => l.nome === "convênio médico gndi" && l.catAtual !== "Saúde" },
  { para: "Assinaturas", quando: (l) => em(nomes("apple one", "youtube member", "gpt"))(l) && l.catAtual !== "Assinaturas" },
  { para: "Gaming", quando: (l) => em(nomes("psn deluxe", "psn", "genshin"))(l) && l.catAtual !== "Gaming" },
  { para: "Contas mãe", quando: em(nomes("passaporte mãe", "ifood (mãe)")) },
  { para: "Alimentação", quando: (l) => em(nomes("posto", "café", "oxxo", "sacolão"))(l) && l.catAtual !== "Alimentação" },
];

function destino(l: Linha): string | null {
  for (const r of REGRAS) if (r.quando(l)) return r.para === l.catAtual ? null : r.para;
  return null;
}
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const { data: cats } = await supabase.from("categoria").select("id, nome, dono");
  const catNome = new Map<string, string>((cats ?? []).map((c: any) => [c.id, c.nome]));
  const catId = new Map<string, string>((cats ?? []).map((c: any) => [c.nome, c.id]));
  const faltam = NOVAS.filter((n) => !catId.has(n));

  const { data: saidas, error } = await supabase
    .from("saida")
    .select("id, nome, pessoa, categoria_id, recorrente_id, parcela, data, created_at, total_cents")
    .or("data.gte.2026-06-01,and(data.is.null,created_at.gte.2026-06-01)")
    .limit(10000);
  if (error) throw error;
  const { data: contratos, error: e2 } = await supabase.from("recorrente").select("id, nome, pessoa, categoria_id");
  if (e2) throw e2;

  const mudancasSaida: { id: string; de: string; para: string; nome: string; pessoa: string; cents: number }[] = [];
  for (const s of saidas as any[]) {
    const l: Linha = { nome: norm(nomeSemParcela(s.nome, s.parcela)), pessoa: s.pessoa, catAtual: s.categoria_id ? catNome.get(s.categoria_id) ?? "?" : "—", fixa: !!s.recorrente_id };
    const para = destino(l);
    if (para) mudancasSaida.push({ id: s.id, de: l.catAtual, para, nome: s.nome, pessoa: s.pessoa, cents: s.total_cents });
  }
  const mudancasContrato: { id: string; de: string; para: string; nome: string; pessoa: string }[] = [];
  for (const c of contratos as any[]) {
    const l: Linha = { nome: norm(c.nome), pessoa: c.pessoa, catAtual: c.categoria_id ? catNome.get(c.categoria_id) ?? "?" : "—", fixa: true };
    const para = destino(l);
    if (para) mudancasContrato.push({ id: c.id, de: l.catAtual, para, nome: c.nome, pessoa: c.pessoa });
  }

  console.log(`Saídas desde jun/2026: ${saidas!.length} · a reclassificar: ${mudancasSaida.length} · contratos a ajustar: ${mudancasContrato.length}`);
  console.log(`Categorias novas: ${faltam.length ? faltam.join(", ") : "(todas já existem)"}\n`);
  const porDestino = new Map<string, { n: number; cents: number; de: Map<string, number> }>();
  for (const m of mudancasSaida) {
    const d = porDestino.get(m.para) ?? { n: 0, cents: 0, de: new Map() };
    d.n += 1; d.cents += m.cents; d.de.set(`${m.nome.replace(/\s\d{2}\/\d{2}$/, "")} (${m.pessoa[0]}, de ${m.de})`, (d.de.get(`${m.nome.replace(/\s\d{2}\/\d{2}$/, "")} (${m.pessoa[0]}, de ${m.de})`) ?? 0) + 1);
    porDestino.set(m.para, d);
  }
  for (const [para, d] of [...porDestino.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`→ ${para}: ${d.n} lançamentos, R$ ${(d.cents / 100).toFixed(0)}`);
    console.log("   " + [...d.de.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ""}`).join(" · "));
  }
  console.log("\nContratos:", mudancasContrato.map((c) => `${c.nome} (${c.pessoa[0]}) ${c.de}→${c.para}`).join(" · ") || "(nenhum)");

  // Antes/depois por categoria (saídas desde junho)
  const antes = new Map<string, number>(); const depois = new Map<string, number>();
  const novoDe = new Map(mudancasSaida.map((m) => [m.id, m.para]));
  for (const s of saidas as any[]) {
    const a = s.categoria_id ? catNome.get(s.categoria_id) ?? "?" : "—";
    antes.set(a, (antes.get(a) ?? 0) + 1);
    const d = novoDe.get(s.id) ?? a;
    depois.set(d, (depois.get(d) ?? 0) + 1);
  }
  const todas = [...new Set([...antes.keys(), ...depois.keys()])].sort((a, b) => (depois.get(b) ?? 0) - (depois.get(a) ?? 0));
  console.log("\nCategoria                  antes → depois");
  for (const c of todas) console.log(`${c.padEnd(26)} ${String(antes.get(c) ?? 0).padStart(5)} → ${String(depois.get(c) ?? 0).padStart(5)}`);

  if (!WRITE) { console.log("\n(dry-run: nada gravado)"); return; }

  for (const nome of faltam) {
    const { data, error } = await supabase.from("categoria").insert({ nome, dono: "Ambos" }).select("id").single();
    if (error) throw error;
    catId.set(nome, data.id);
  }
  let ok = 0;
  for (const m of mudancasSaida) {
    const { error } = await supabase.from("saida").update({ categoria_id: catId.get(m.para) }).eq("id", m.id);
    if (error) throw error;
    ok += 1;
  }
  for (const c of mudancasContrato) {
    const { error } = await supabase.from("recorrente").update({ categoria_id: catId.get(c.para) }).eq("id", c.id);
    if (error) throw error;
  }
  console.log(`\nGRAVADO: ${faltam.length} categorias criadas · ${ok} saídas reclassificadas · ${mudancasContrato.length} contratos ajustados`);
}
main();
