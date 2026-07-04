import { describe, expect, it } from "vitest";
import {
  entradasAReceberDoMesCents,
  entradasDoMesCents,
  gastosDoMesCents,
  projecaoSaldoMeses,
  resolverContaEfetivaDaSaida,
  resumoContaMes,
  saidasAPagarDoMesCents,
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
  it("saldo_atual + a receber - a pagar", () => {
    expect(saldoPrevistoCents(100000, 50000, 30000)).toBe(120000);
  });

  it("pode ficar negativo", () => {
    expect(saldoPrevistoCents(1000, 0, 5000)).toBe(-4000);
  });
});

describe("saidasAPagarDoMesCents (só o que ainda não foi pago)", () => {
  it("soma saídas do mês a pagar, mas ignora as já pagas (já estão no saldo)", () => {
    const saidas = [
      { ...saida({ total_cents: 10000 }), status: "A pagar" as const },
      { ...saida({ total_cents: 7000 }), status: "Pago" as const },
    ];
    expect(saidasAPagarDoMesCents(CONTA, saidas, mesReferencia)).toBe(10000);
  });

  it("inclui saída do mês ainda não paga com outros status (ex.: Faturado)", () => {
    const fatura = { ...saida({ total_cents: 25000 }), status: "Faturado" as const };
    expect(saidasAPagarDoMesCents(CONTA, [fatura], mesReferencia)).toBe(25000);
  });
});

describe("entradasAReceberDoMesCents (só o que ainda não entrou)", () => {
  it("soma entradas do mês a receber, mas ignora as já recebidas (já estão no saldo)", () => {
    const entradas = [
      { quantia_cents: 500000, data: "2026-07-05", conta_destino_id: CONTA, status: "Não recebido" as const },
      { quantia_cents: 300000, data: "2026-07-06", conta_destino_id: CONTA, status: "Recebido" as const },
    ];
    expect(entradasAReceberDoMesCents(CONTA, entradas, mesReferencia)).toBe(500000);
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
      { quantia_cents: 30000, data: "2026-07-05", conta_destino_id: CONTA, status: "Não recebido" as const },
      { quantia_cents: 30000, data: "2026-08-05", conta_destino_id: CONTA, status: "Não recebido" as const },
    ];
    const base = {
      created_at: "2026-06-10T12:00:00.000Z",
      cartao_id: null,
      conta_id: CONTA,
      metodo: "Débito" as const,
      status: "A pagar" as const,
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
      status: "A pagar" as const,
    };
    const resultado = resumoContaMes(conta, [compraNoCredito], [], mesReferencia, cartaoParaConta);
    expect(resultado.gastos).toBe(20000);
    expect(resultado.aPagar).toBe(20000);
    expect(resultado.saldoPrevisto).toBe(80000);
  });

  it("não desconta de novo a compra já paga — ela já está no saldo_atual", () => {
    const conta = { id: CONTA, saldo_atual_cents: 80000 };
    const cartaoParaConta = new Map([["cartao-1", CONTA]]);
    const compraPaga = {
      total_cents: 20000,
      data: "2026-06-10",
      created_at: "2026-06-10T12:00:00.000Z",
      cartao_id: "cartao-1",
      conta_id: null,
      vencimento: "2026-07-10",
      metodo: "Crédito" as const,
      status: "Pago" as const,
    };
    const resultado = resumoContaMes(conta, [compraPaga], [], mesReferencia, cartaoParaConta);
    expect(resultado.gastos).toBe(20000); // movimento bruto ainda aparece
    expect(resultado.aPagar).toBe(0); // mas não pesa no previsto
    expect(resultado.saldoPrevisto).toBe(80000);
  });
});
