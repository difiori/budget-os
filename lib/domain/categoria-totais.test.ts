import { describe, expect, it } from "vitest";
import { gastosPorCategoria } from "./categoria-totais";
import type { Saida } from "./types";

const mesReferencia = { year: 2026, month: 8, day: 1 };

function saida(overrides: Partial<Saida>): Saida {
  return {
    id: "1",
    nome: "Teste",
    total_cents: 1000,
    data: "2026-07-10",
    vencimento: "2026-08-10",
    pessoa: "Diego",
    metodo: "Crédito",
    status: "A pagar",
    origem: "Manual",
    categoria_id: "cat-1",
    conta_id: null,
    cartao_id: "cartao-1",
    parcela: null,
    created_at: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("gastosPorCategoria", () => {
  it("soma saídas da mesma categoria por vencimento no mês", () => {
    const saidas = [
      saida({ total_cents: 1000, categoria_id: "cat-1" }),
      saida({ total_cents: 500, categoria_id: "cat-1" }),
      saida({ total_cents: 2000, categoria_id: "cat-2" }),
    ];
    const totais = gastosPorCategoria(saidas, mesReferencia);
    expect(totais.get("cat-1")).toBe(1500);
    expect(totais.get("cat-2")).toBe(2000);
  });

  it("ignora saídas sem categoria (A classificar) e de outro mês", () => {
    const saidas = [
      saida({ categoria_id: null }),
      saida({ vencimento: "2026-09-10" }),
      saida({ vencimento: null }),
    ];
    const totais = gastosPorCategoria(saidas, mesReferencia);
    expect(totais.size).toBe(0);
  });
});
