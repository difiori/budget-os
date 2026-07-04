import { describe, expect, it } from "vitest";
import { faturaAtualCents, limiteComprometidoCents, limiteDisponivelCents } from "./fatura";
import { parseCentsFromBRL } from "./money";
import type { SaidaOrigem, SaidaParaCalculo, SaidaStatus } from "./types";

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
  overrides: Partial<SaidaParaCalculo> & { status?: SaidaStatus; origem?: SaidaOrigem }
): SaidaParaCalculo & { status: SaidaStatus; origem: SaidaOrigem } {
  return { ...saida(overrides), status: overrides.status ?? "A pagar", origem: overrides.origem ?? "Manual" };
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
    // Compra parcelada: cada parcela cai num mês (data própria), origem Parcelamento.
    const saidas = [
      saidaComStatus({ total_cents: 3333, data: "2026-08-10", origem: "Parcelamento" }),
      saidaComStatus({ total_cents: 3333, data: "2026-09-10", origem: "Parcelamento" }),
      saidaComStatus({ total_cents: 3334, data: "2026-10-10", origem: "Parcelamento" }),
    ];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas, mesReferencia)).toBe(10000);
  });

  it("ignora saídas já pagas", () => {
    const saidas = [
      saidaComStatus({ total_cents: 10000, status: "Pago" }),
      saidaComStatus({ total_cents: 5000, status: "A pagar" }),
    ];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas, mesReferencia)).toBe(5000);
  });

  it("ignora compras de outros cartões", () => {
    const saidas = [saidaComStatus({ total_cents: 10000, cartao_id: OUTRO_CARTAO, status: "A pagar" })];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas, mesReferencia)).toBe(0);
  });

  it("ignora compras de meses passados (anteriores à fatura a vencer)", () => {
    // maio/2026 < junho (a vencer p/ foco julho) — dado antigo não pesa no limite.
    const saidas = [saidaComStatus({ total_cents: 10000, data: "2026-05-10" })];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas, mesReferencia)).toBe(0);
  });

  it("conta a fatura a vencer (mês anterior ainda não paga)", () => {
    const saidas = [saidaComStatus({ total_cents: 8000, data: "2026-06-10" })];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas, mesReferencia)).toBe(8000);
  });

  it("no futuro só conta parcela — recorrente e avulsa futuras não pesam", () => {
    const saidas = [
      saidaComStatus({ total_cents: 5000, data: "2026-09-10", origem: "Recorrente" }), // assinatura futura
      saidaComStatus({ total_cents: 4000, data: "2026-10-10", origem: "Manual" }), // avulsa futura (projeção)
      saidaComStatus({ total_cents: 2000, data: "2026-11-10", origem: "Parcelamento" }), // parcela futura
    ];
    // só a parcela futura conta.
    expect(limiteComprometidoCents(CARBON_BLACK, saidas, mesReferencia)).toBe(2000);
  });

  it("recorrente da fatura a vencer (mês anterior) conta; da fatura do mês, não", () => {
    const saidas = [
      saidaComStatus({ total_cents: 3000, data: "2026-06-10", origem: "Recorrente" }), // a vencer — pesa (anuidade a pagar)
      saidaComStatus({ total_cents: 5000, data: "2026-07-10", origem: "Recorrente" }), // do mês — não pesa ainda
    ];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas, mesReferencia)).toBe(3000);
  });

  it("na fatura do mês conta avulsa e parcela, mas não recorrente", () => {
    const saidas = [
      saidaComStatus({ total_cents: 3000, data: "2026-07-10", origem: "Manual" }), // do mês, avulsa — pesa
      saidaComStatus({ total_cents: 1000, data: "2026-07-15", origem: "Parcelamento" }), // do mês, parcela — pesa
      saidaComStatus({ total_cents: 5000, data: "2026-07-20", origem: "Recorrente" }), // do mês, recorrente — não
    ];
    expect(limiteComprometidoCents(CARBON_BLACK, saidas, mesReferencia)).toBe(4000);
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
