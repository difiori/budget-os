import { describe, expect, it } from "vitest";
import {
  categoriasComparadas,
  entradasNoMes,
  fixasVsVariaveis,
  maioresSaidas,
  saidasComVencimentoNoMes,
  taxaPoupancaPct,
  variacao,
} from "./fechamento";

describe("variacao", () => {
  it("diferença e percentual sobre o anterior", () => {
    expect(variacao(12000, 10000)).toEqual({ abs: 2000, pct: 20 });
    expect(variacao(8000, 10000)).toEqual({ abs: -2000, pct: -20 });
  });
  it("sem base, percentual é null", () => {
    expect(variacao(5000, 0)).toEqual({ abs: 5000, pct: null });
  });
});

describe("taxaPoupancaPct", () => {
  it("(entradas − saídas) / entradas", () => {
    expect(taxaPoupancaPct(10000, 7500)).toBe(25);
    expect(taxaPoupancaPct(10000, 12000)).toBe(-20);
  });
  it("sem entradas não inventa taxa", () => {
    expect(taxaPoupancaPct(0, 500)).toBeNull();
  });
});

describe("recortes de mês", () => {
  const set = { year: 2026, month: 9, day: 1 };
  it("saídas por vencimento, entradas por data", () => {
    const saidas = [{ vencimento: "2026-09-10" }, { vencimento: "2026-10-10" }, { vencimento: null }];
    expect(saidasComVencimentoNoMes(saidas, set)).toHaveLength(1);
    const entradas = [{ data: "2026-09-05" }, { data: "2026-08-05" }];
    expect(entradasNoMes(entradas, set)).toHaveLength(1);
  });
});

describe("fixasVsVariaveis", () => {
  it("separa por recorrente_id", () => {
    const r = fixasVsVariaveis([
      { total_cents: 1000, recorrente_id: "a" },
      { total_cents: 2000, recorrente_id: null },
      { total_cents: 500, recorrente_id: undefined },
    ]);
    expect(r).toEqual({ fixas: 1000, variaveis: 2500, nFixas: 1, nVariaveis: 2 });
  });
});

describe("categoriasComparadas", () => {
  it("junta atual e anterior por categoria, ordena pelo atual, inclui sem categoria", () => {
    const atual = [
      { total_cents: 300, categoria_id: "a" },
      { total_cents: 100, categoria_id: "b" },
      { total_cents: 50, categoria_id: null },
    ];
    const anterior = [
      { total_cents: 200, categoria_id: "a" },
      { total_cents: 400, categoria_id: "c" },
    ];
    const r = categoriasComparadas(atual, anterior);
    expect(r.map((l) => l.categoriaId)).toEqual(["a", "b", null, "c"]);
    expect(r[0]).toEqual({ categoriaId: "a", atual: 300, anterior: 200, variacao: { abs: 100, pct: 50 } });
    expect(r[3]).toEqual({ categoriaId: "c", atual: 0, anterior: 400, variacao: { abs: -400, pct: -100 } });
  });
});

describe("maioresSaidas", () => {
  it("as N maiores, decrescente", () => {
    const r = maioresSaidas([{ total_cents: 5 }, { total_cents: 50 }, { total_cents: 20 }], 2);
    expect(r.map((s) => s.total_cents)).toEqual([50, 20]);
  });
});
