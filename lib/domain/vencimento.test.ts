import { describe, expect, it } from "vitest";
import { calcularVencimento } from "./vencimento";

describe("calcularVencimento (regra 7 — regra alvo, diferente do legado)", () => {
  it("crédito: vencimento = dia 10 do mês seguinte à data", () => {
    expect(calcularVencimento({ year: 2026, month: 7, day: 15 }, "Crédito")).toEqual({
      year: 2026,
      month: 8,
      day: 10,
    });
  });

  it("crédito: vira o ano quando a compra é em dezembro", () => {
    expect(calcularVencimento({ year: 2026, month: 12, day: 20 }, "Crédito")).toEqual({
      year: 2027,
      month: 1,
      day: 10,
    });
  });

  it("débito: vencimento = data", () => {
    expect(calcularVencimento({ year: 2026, month: 7, day: 15 }, "Débito")).toEqual({
      year: 2026,
      month: 7,
      day: 15,
    });
  });
});

describe("calcularVencimento com ciclo real do cartão", () => {
  const fecha25 = { dia_fechamento: 25, dia_vencimento: 10 };
  it("compra até o fechamento vence no mês seguinte; depois do fechamento pula mais um", () => {
    expect(calcularVencimento({ year: 2026, month: 9, day: 20 }, "Crédito", fecha25)).toEqual({ year: 2026, month: 10, day: 10 });
    expect(calcularVencimento({ year: 2026, month: 9, day: 28 }, "Crédito", fecha25)).toEqual({ year: 2026, month: 11, day: 10 });
  });
  it("fecha 5 e vence 15: vence no próprio mês da fatura", () => {
    expect(calcularVencimento({ year: 2026, month: 9, day: 3 }, "Crédito", { dia_fechamento: 5, dia_vencimento: 15 })).toEqual({ year: 2026, month: 9, day: 15 });
  });
  it("débito ignora o ciclo", () => {
    expect(calcularVencimento({ year: 2026, month: 9, day: 28 }, "Débito", fecha25)).toEqual({ year: 2026, month: 9, day: 28 });
  });
});
