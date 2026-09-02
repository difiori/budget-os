import { describe, expect, it } from "vitest";
import {
  entradasAReceberDoMesCents,
  entradasDoMesCents,
  gastosDoMesCents,
  projecaoSaldoMeses,
  resolverContaEfetivaDaSaida,
  resumoContaMes,
  saidasAPagarDoMesCents,
  saldoInicioMesCents,
  saldoPrevistoCents,
  usoDoDisponivelPct,
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

describe("saldoInicioMesCents (reconstruído do saldo atual)", () => {
  const conta = { id: CONTA, saldo_atual_cents: 100000 };
  const setembro = { year: 2026, month: 9, day: 1 };
  const entrada = (o: Partial<{ quantia_cents: number; data: string; status: "Recebido" | "Não recebido"; conta_destino_id: string }>) => ({
    quantia_cents: 0,
    data: "2026-09-05",
    status: "Recebido" as const,
    conta_destino_id: CONTA,
    ...o,
  });
  const saidaSt = (o: Partial<SaidaParaCalculo & { status: "Pago" | "A pagar" }>) => ({
    ...saida({ vencimento: "2026-09-10" }),
    status: "Pago" as const,
    ...o,
  });

  it("desfaz entradas recebidas e saídas pagas do mês em diante", () => {
    const entradas = [entrada({ quantia_cents: 50000, data: "2026-09-05" }), entrada({ quantia_cents: 7000, data: "2026-10-02" })];
    const saidas = [saidaSt({ total_cents: 20000, vencimento: "2026-09-10" }), saidaSt({ total_cents: 3000, vencimento: "2026-10-10" })];
    // 100000 − 50000 − 7000 + 20000 + 3000
    expect(saldoInicioMesCents(conta, saidas, entradas, setembro)).toBe(66000);
  });

  it("antecipa pendências de antes do mês (ainda vão liquidar)", () => {
    const entradas = [entrada({ quantia_cents: 30000, data: "2026-08-20", status: "Não recebido" })];
    const saidas = [saidaSt({ total_cents: 10000, vencimento: "2026-08-25", status: "A pagar" })];
    expect(saldoInicioMesCents(conta, saidas, entradas, setembro)).toBe(120000);
  });

  it("ignora pendências do próprio mês e liquidações de antes do mês", () => {
    const entradas = [
      entrada({ quantia_cents: 30000, data: "2026-09-20", status: "Não recebido" }),
      entrada({ quantia_cents: 99999, data: "2026-08-05", status: "Recebido" }),
    ];
    const saidas = [
      saidaSt({ total_cents: 10000, vencimento: "2026-09-25", status: "A pagar" }),
      saidaSt({ total_cents: 88888, vencimento: "2026-08-10", status: "Pago" }),
      saidaSt({ total_cents: 777, vencimento: null }),
    ];
    expect(saldoInicioMesCents(conta, saidas, entradas, setembro)).toBe(100000);
  });

  it("só considera lançamentos da própria conta", () => {
    const entradas = [entrada({ quantia_cents: 50000, conta_destino_id: "outra" })];
    const saidas = [saidaSt({ total_cents: 20000, conta_id: "outra" })];
    expect(saldoInicioMesCents(conta, saidas, entradas, setembro)).toBe(100000);
  });

  it("resumoContaMes expõe o saldo inicial resolvendo crédito pela conta vinculada", () => {
    const vinculo = new Map([["cartao-1", CONTA]]);
    const saidas = [
      { ...saida({ total_cents: 15000, vencimento: "2026-09-10", conta_id: null, cartao_id: "cartao-1" }), metodo: "Crédito" as const, status: "Pago" as const },
    ];
    const r = resumoContaMes(conta, saidas, [], setembro, vinculo);
    expect(r.saldoInicio).toBe(115000);
  });
});

describe("usoDoDisponivelPct", () => {
  it("saídas sobre saldo inicial + entradas do mês", () => {
    // Entrada grande no mês anterior fica no saldo inicial e entra na base.
    expect(usoDoDisponivelPct(30000, 50000, 10000)).toBe(50);
  });
  it("sem disponível positivo, não inventa percentual", () => {
    expect(usoDoDisponivelPct(30000, -20000, 10000)).toBeNull();
    expect(usoDoDisponivelPct(0, 0, 0)).toBeNull();
  });
});
