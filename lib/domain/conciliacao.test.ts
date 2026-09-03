import { describe, expect, it } from "vitest";
import { conciliar, normalizarNome, similaridadeNomes, type ItemFatura, type SaidaConciliavel } from "./conciliacao";

const s = (p: Partial<SaidaConciliavel> & Pick<SaidaConciliavel, "id" | "nome" | "total_cents">): SaidaConciliavel => ({
  data: "2026-08-10",
  created_at: "2026-08-10T12:00:00Z",
  parcela: null,
  ...p,
});
const it_ = (data: string, descricao: string, valor_cents: number, parcela: string | null = null): ItemFatura => ({ data, descricao, valor_cents, parcela });

describe("normalizarNome / similaridadeNomes", () => {
  it("limpa acentos, ruído de fatura e parcelas", () => {
    expect(normalizarNome("AMAZON BR*PARC 02/10")).toBe("amazon br");
    expect(normalizarNome("Netflix.com")).toBe("netflix com");
  });
  it("mede parecença", () => {
    expect(similaridadeNomes("Amazon", "AMAZON BR")).toBeGreaterThanOrEqual(0.9);
    expect(similaridadeNomes("Uber", "Netflix")).toBe(0);
    expect(similaridadeNomes("Farmácia mãe", "FARMACIA SAO PAULO")).toBeGreaterThan(0);
  });
});

describe("conciliar", () => {
  it("valor igual e data próxima confere; item só na fatura falta; saída só no app sobra", () => {
    const itens = [it_("2026-08-10", "AMAZON BR", 5400), it_("2026-08-12", "NETFLIX", 5590)];
    const saidas = [s({ id: "a", nome: "Amazon", total_cents: 5400 }), s({ id: "b", nome: "Uber", total_cents: 2340, data: "2026-08-11" })];
    const r = conciliar(itens, saidas);
    expect(r.conferidas.map((c) => c.saida.id)).toEqual(["a"]);
    expect(r.faltamNoApp.map((i) => i.descricao)).toEqual(["NETFLIX"]);
    expect(r.sobramNoApp.map((x) => x.id)).toEqual(["b"]);
    expect(r.totalFatura).toBe(10990);
    expect(r.totalApp).toBe(7740);
  });

  it("valor igual com data mais distante ainda confere (data de postagem)", () => {
    const r = conciliar([it_("2026-08-19", "IFOOD", 8990)], [s({ id: "a", nome: "iFood", total_cents: 8990, data: "2026-08-10" })]);
    expect(r.conferidas).toHaveLength(1);
  });

  it("nome parecido com valor um pouco diferente vira divergente, com a diferença", () => {
    const r = conciliar([it_("2026-08-10", "ENEL SP", 47385)], [s({ id: "a", nome: "Enel", total_cents: 46000 })]);
    expect(r.divergentes).toHaveLength(1);
    expect(r.divergentes[0].diferencaCents).toBe(1385);
    expect(r.faltamNoApp).toHaveLength(0);
  });

  it("não casa duas vezes a mesma saída e prefere a data mais próxima", () => {
    const itens = [it_("2026-08-10", "AMAZON", 5400), it_("2026-08-20", "AMAZON", 5400)];
    const saidas = [s({ id: "a", nome: "Amazon", total_cents: 5400, data: "2026-08-20" })];
    const r = conciliar(itens, saidas);
    expect(r.conferidas).toHaveLength(1);
    expect(r.conferidas[0].item.data).toBe("2026-08-20");
    expect(r.faltamNoApp).toHaveLength(1);
  });

  it("estorno negativo não casa com compra positiva", () => {
    const r = conciliar([it_("2026-08-10", "ESTORNO AMAZON", -5400)], [s({ id: "a", nome: "Amazon", total_cents: 5400 })]);
    expect(r.conferidas).toHaveLength(0);
    expect(r.faltamNoApp).toHaveLength(1);
    expect(r.sobramNoApp).toHaveLength(1);
  });
});
