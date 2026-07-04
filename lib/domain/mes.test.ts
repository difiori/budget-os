import { describe, expect, it } from "vitest";
import {
  entradasDoMesCents,
  gastosDoMesCents,
  projecaoSaldoMeses,
  resolverContaEfetivaDaSaida,
  resumoContaMes,
  saldoPrevistoCents,
} from "./mes";
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

describe("resolverContaEfetivaDaSaida", () => {
  const mapa = new Map([["cartao-1", "conta-vinculada"]]);

  it("débito usa a própria conta_id", () => {
    expect(resolverContaEfetivaDaSaida({ conta_id: CONTA, cartao_id: null, metodo: "Débito" }, mapa)).toBe(CONTA);
  });

  it("crédito resolve pela conta vinculada ao cartão", () => {
    expect(
      resolverContaEfetivaDaSaida({ conta_id: null, cartao_id: "cartao-1", metodo: "Crédito" }, mapa)
    ).toBe("conta-vinculada");
  });

  it("crédito sem cartão vinculado não resolve pra nenhuma conta", () => {
    expect(resolverContaEfetivaDaSaida({ conta_id: null, cartao_id: "cartao-sem-conta", metodo: "Crédito" }, mapa)).toBeNull();
  });
});

describe("projecaoSaldoMeses", () => {
  it("encadeia o saldo previsto de um mês pro próximo (não repete o saldo real)", () => {
    const contas = [{ id: CONTA, saldo_atual_cents: 100000 }];
    // 30000 de entrada e 10000 de saída em cada um dos dois meses da projeção.
    const entradas = [
      { quantia_cents: 30000, data: "2026-07-05", conta_destino_id: CONTA },
      { quantia_cents: 30000, data: "2026-08-05", conta_destino_id: CONTA },
    ];
    const base = {
      created_at: "2026-06-10T12:00:00.000Z",
      cartao_id: null,
      conta_id: CONTA,
      metodo: "Débito" as const,
    };
    const saidas = [
      { ...base, total_cents: 10000, data: "2026-07-05", vencimento: "2026-07-10" },
      { ...base, total_cents: 10000, data: "2026-08-05", vencimento: "2026-08-10" },
    ];
    const meses = [
      { year: 2026, month: 7, day: 1 },
      { year: 2026, month: 8, day: 1 },
    ];
    const resultado = projecaoSaldoMeses(contas, saidas, entradas, meses, new Map());
    // mês 1: 100000 + 30000 - 10000 = 120000
    expect(resultado[0].saldoTotal).toBe(120000);
    // mês 2: encadeia a partir de 120000, não de volta pros 100000 originais.
    expect(resultado[1].saldoTotal).toBe(140000);
  });
});

describe("resumoContaMes (regressão do bug: crédito não descontava do saldo previsto)", () => {
  it("desconta compra no crédito com vencimento no mês, resolvendo pela conta vinculada ao cartão", () => {
    const conta = { id: CONTA, saldo_atual_cents: 100000 };
    const cartaoParaConta = new Map([["cartao-1", CONTA]]);
    const compraNoCredito = {
      total_cents: 20000,
      data: "2026-06-10",
      created_at: "2026-06-10T12:00:00.000Z",
      cartao_id: "cartao-1",
      conta_id: null,
      vencimento: "2026-07-10",
      metodo: "Crédito" as const,
    };
    const resultado = resumoContaMes(conta, [compraNoCredito], [], mesReferencia, cartaoParaConta);
    expect(resultado.gastos).toBe(20000);
    expect(resultado.saldoPrevisto).toBe(80000);
  });
});
