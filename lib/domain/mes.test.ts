import { describe, expect, it } from "vitest";
import { entradasDoMesCents, gastosDoMesCents, saldoPrevistoCents } from "./mes";
import type { SaidaParaCalculo } from "./types";

const CONTA = "conta-1";
const mesReferencia = { year: 2026, month: 7, day: 1 };

function saida(overrides: Partial<SaidaParaCalculo>): SaidaParaCalculo {
  return {
    total_cents: 0,
    data: "2026-06-10",
    created_at: "2026-06-10T12:00:00.000Z",
    cartao_id: null,
    conta_id: CONTA,
    vencimento: "2026-07-10",
    ...overrides,
  };
}

describe("gastosDoMesCents (regra 4 — por vencimento)", () => {
  it("soma saídas da conta cujo vencimento cai no mês corrente", () => {
    const saidas = [saida({ total_cents: 10000 })];
    expect(gastosDoMesCents(CONTA, saidas, mesReferencia)).toBe(10000);
  });

  it("ignora saídas com vencimento fora do mês corrente", () => {
    const saidas = [saida({ total_cents: 10000, vencimento: "2026-08-10" })];
    expect(gastosDoMesCents(CONTA, saidas, mesReferencia)).toBe(0);
  });

  it("ignora saídas sem vencimento definido", () => {
    const saidas = [saida({ total_cents: 10000, vencimento: null })];
    expect(gastosDoMesCents(CONTA, saidas, mesReferencia)).toBe(0);
  });
});

describe("entradasDoMesCents (regra 4 — por data)", () => {
  it("soma entradas da conta com `data` no mês corrente", () => {
    const entradas = [{ quantia_cents: 500000, data: "2026-07-05", conta_destino_id: CONTA }];
    expect(entradasDoMesCents(CONTA, entradas, mesReferencia)).toBe(500000);
  });

  it("ignora entradas de outra conta ou outro mês", () => {
    const entradas = [
      { quantia_cents: 500000, data: "2026-06-05", conta_destino_id: CONTA },
      { quantia_cents: 500000, data: "2026-07-05", conta_destino_id: "outra-conta" },
    ];
    expect(entradasDoMesCents(CONTA, entradas, mesReferencia)).toBe(0);
  });
});

describe("saldoPrevistoCents", () => {
  it("saldo_atual + entradas do mês - gastos do mês", () => {
    expect(saldoPrevistoCents(100000, 50000, 30000)).toBe(120000);
  });

  it("pode ficar negativo", () => {
    expect(saldoPrevistoCents(1000, 0, 5000)).toBe(-4000);
  });
});
