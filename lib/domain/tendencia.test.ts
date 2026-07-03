import { describe, expect, it } from "vitest";
import { entradasPorMes, gastosPorMes, ultimosMeses } from "./tendencia";
import type { Entrada, Saida } from "./types";

function saida(overrides: Partial<Saida>): Saida {
  return {
    id: "1",
    nome: "Teste",
    total_cents: 1000,
    data: null,
    vencimento: "2026-07-10",
    pessoa: "Diego",
    metodo: "Crédito",
    status: "A pagar",
    origem: "Manual",
    categoria_id: null,
    conta_id: null,
    cartao_id: "cartao-1",
    parcela: null,
    created_at: "2026-06-10T12:00:00.000Z",
    ...overrides,
  };
}

function entrada(overrides: Partial<Entrada>): Entrada {
  return {
    id: "1",
    nome: "Teste",
    quantia_cents: 1000,
    valor_recebido_cents: null,
    data: "2026-07-05",
    pessoa: "Diego",
    status: "Recebido",
    conta_destino_id: "conta-1",
    notas: null,
    created_at: "2026-07-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("ultimosMeses", () => {
  it("retorna N meses terminando no mês de referência, do mais antigo pro mais recente", () => {
    const meses = ultimosMeses({ year: 2026, month: 7, day: 1 }, 3);
    expect(meses).toEqual([
      { year: 2026, month: 5, day: 1 },
      { year: 2026, month: 6, day: 1 },
      { year: 2026, month: 7, day: 1 },
    ]);
  });
});

describe("gastosPorMes", () => {
  it("soma saídas por vencimento em cada mês da lista", () => {
    const meses = [
      { year: 2026, month: 6, day: 1 },
      { year: 2026, month: 7, day: 1 },
    ];
    const saidas = [
      saida({ total_cents: 500, vencimento: "2026-06-15" }),
      saida({ total_cents: 700, vencimento: "2026-07-01" }),
      saida({ total_cents: 300, vencimento: "2026-07-28" }),
      saida({ total_cents: 999, vencimento: "2026-08-01" }),
    ];
    expect(gastosPorMes(saidas, meses)).toEqual([500, 1000]);
  });
});

describe("entradasPorMes", () => {
  it("soma entradas por data em cada mês da lista", () => {
    const meses = [
      { year: 2026, month: 7, day: 1 },
      { year: 2026, month: 8, day: 1 },
    ];
    const entradas = [
      entrada({ quantia_cents: 1000, data: "2026-07-05" }),
      entrada({ quantia_cents: 2000, data: "2026-07-20" }),
      entrada({ quantia_cents: 500, data: "2026-08-01" }),
    ];
    expect(entradasPorMes(entradas, meses)).toEqual([3000, 500]);
  });
});
