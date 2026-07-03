import { describe, expect, it } from "vitest";
import { faturaAtualCents, limiteComprometidoCents, limiteDisponivelCents } from "./fatura";
import { parseCentsFromBRL } from "./money";
import type { SaidaParaCalculo, SaidaStatus } from "./types";

const CARBON_BLACK = "cartao-carbon-black";
const OUTRO_CARTAO = "cartao-outro";
const mesReferencia = { year: 2026, month: 7, day: 1 };

function saida(overrides: Partial<SaidaParaCalculo>): SaidaParaCalculo {
  return {
    total_cents: 0,
    data: "2026-07-10",
    created_at: "2026-07-10T12:00:00.000Z",
    cartao_id: CARBON_BLACK,
    conta_id: null,
    vencimento: "2026-08-10",
    ...overrides,
  };
}

function saidaComStatus(
  overrides: Partial<SaidaParaCalculo> & { status?: SaidaStatus }
): SaidaParaCalculo & { status: SaidaStatus } {
  return { ...saida(overrides), status: overrides.status ?? "A pagar" };
}

describe("faturaAtualCents (regras 1-2)", () => {
  it("critério de aceite F1: compra de R$ 1.234,56 no crédito entra na fatura do mês da compra", () => {
    const saidas = [saida({ total_cents: parseCentsFromBRL("1.234,56") })];
    expect(faturaAtualCents(CARBON_BLACK, saidas, mesReferencia)).toBe(123456);
  });

  it("soma múltiplas compras do mesmo cartão no mesmo mês", () => {
    const saidas = [
      saida({ total_cents: 10000 }),
      saida({ total_cents: 5000, data: "2026-07-31" }),
    ];
    expect(faturaAtualCents(CARBON_BLACK, saidas, mesReferencia)).toBe(15000);
  });

  it("ignora compras de outros cartões", () => {
    const saidas = [saida({ total_cents: 10000, cartao_id: OUTRO_CARTAO })];
    expect(faturaAtualCents(CARBON_BLACK, saidas, mesReferencia)).toBe(0);
  });

  it("ignora compras de outros meses", () => {
    const saidas = [saida({ total_cents: 10000, data: "2026-06-30" })];
    expect(faturaAtualCents(CARBON_BLACK, saidas, mesReferencia)).toBe(0);
  });

  it("usa o fallback de created_at (regra 3) quando `data` é nula", () => {
    const saidas = [saida({ total_cents: 10000, data: null, created_at: "2026-07-05T12:00:00.000Z" })];
    expect(faturaAtualCents(CARBON_BLACK, saidas, mesReferencia)).toBe(10000);
  });
});

describe("limiteComprometidoCents", () => {
  it("soma parcelas futuras não pagas por inteiro, não só a do mês corrente", () => {
    const saidas = [
      saidaComStatus({ total_cents: 3333, vencimento: "2026-08-10", status: "A pagar" }),
      saidaComStatus({ total_cents: 3333, vencimento: "2026-09-10", status: "A pagar" }),
      saidaComStatus({ total_cents: 3334, vencimento: "2026-10-10", status: "A pagar" }),
    ];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas)).toBe(10000);
  });

  it("ignora saídas já pagas", () => {
    const saidas = [
      saidaComStatus({ total_cents: 10000, status: "Pago" }),
      saidaComStatus({ total_cents: 5000, status: "A pagar" }),
    ];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas)).toBe(5000);
  });

  it("ignora compras de outros cartões", () => {
    const saidas = [saidaComStatus({ total_cents: 10000, cartao_id: OUTRO_CARTAO, status: "A pagar" })];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas)).toBe(0);
  });
});

describe("limiteDisponivelCents", () => {
  it("limite - comprometido", () => {
    expect(limiteDisponivelCents(320560, 123456)).toBe(197104);
  });

  it("retorna null para cartões sem limite", () => {
    expect(limiteDisponivelCents(null, 10000)).toBeNull();
  });
});
