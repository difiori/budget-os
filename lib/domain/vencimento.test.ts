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
