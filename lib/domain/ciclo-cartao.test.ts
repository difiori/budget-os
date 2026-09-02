import { describe, expect, it } from "vitest";
import { CICLO_PADRAO, fechamentoDaFatura, mesDaFatura, periodoDaFatura, vencimentoDaFatura } from "./ciclo-cartao";

const FECHA_25 = { dia_fechamento: 25, dia_vencimento: 10 };
const FECHA_5_VENCE_15 = { dia_fechamento: 5, dia_vencimento: 15 };

describe("mesDaFatura", () => {
  it("ciclo padrão (fecha no último dia): fatura = mês da compra", () => {
    expect(mesDaFatura({ year: 2026, month: 9, day: 30 }, CICLO_PADRAO)).toEqual({ year: 2026, month: 9, day: 1 });
    expect(mesDaFatura({ year: 2026, month: 2, day: 28 }, CICLO_PADRAO)).toEqual({ year: 2026, month: 2, day: 1 });
  });
  it("fecha dia 25: compra até o 25 fica no mês, depois vai para o seguinte", () => {
    expect(mesDaFatura({ year: 2026, month: 9, day: 25 }, FECHA_25)).toEqual({ year: 2026, month: 9, day: 1 });
    expect(mesDaFatura({ year: 2026, month: 9, day: 26 }, FECHA_25)).toEqual({ year: 2026, month: 10, day: 1 });
    expect(mesDaFatura({ year: 2026, month: 12, day: 28 }, FECHA_25)).toEqual({ year: 2027, month: 1, day: 1 });
  });
});

describe("vencimentoDaFatura", () => {
  it("padrão: dia 10 do mês seguinte (regra 7 histórica)", () => {
    expect(vencimentoDaFatura({ year: 2026, month: 9 }, CICLO_PADRAO)).toEqual({ year: 2026, month: 10, day: 10 });
    expect(vencimentoDaFatura({ year: 2026, month: 12 }, CICLO_PADRAO)).toEqual({ year: 2027, month: 1, day: 10 });
  });
  it("fecha 25, vence 10: vence no mês seguinte", () => {
    expect(vencimentoDaFatura({ year: 2026, month: 9 }, FECHA_25)).toEqual({ year: 2026, month: 10, day: 10 });
  });
  it("fecha 5, vence 15: vence no próprio mês", () => {
    expect(vencimentoDaFatura({ year: 2026, month: 9 }, FECHA_5_VENCE_15)).toEqual({ year: 2026, month: 9, day: 15 });
  });
  it("dia de vencimento maior que o mês é limitado", () => {
    expect(vencimentoDaFatura({ year: 2026, month: 1 }, { dia_fechamento: 5, dia_vencimento: 31 })).toEqual({ year: 2026, month: 1, day: 31 });
    expect(vencimentoDaFatura({ year: 2026, month: 2 }, { dia_fechamento: 5, dia_vencimento: 31 })).toEqual({ year: 2026, month: 2, day: 28 });
  });
});

describe("fechamento e período", () => {
  it("fechamento limitado ao tamanho do mês", () => {
    expect(fechamentoDaFatura({ year: 2026, month: 2 }, CICLO_PADRAO)).toEqual({ year: 2026, month: 2, day: 28 });
    expect(fechamentoDaFatura({ year: 2026, month: 9 }, FECHA_25)).toEqual({ year: 2026, month: 9, day: 25 });
  });
  it("período: padrão é o mês inteiro; fecha 25 vai de 26 do anterior a 25", () => {
    expect(periodoDaFatura({ year: 2026, month: 9 }, CICLO_PADRAO)).toEqual({
      inicio: { year: 2026, month: 9, day: 1 },
      fim: { year: 2026, month: 9, day: 30 },
    });
    expect(periodoDaFatura({ year: 2026, month: 9 }, FECHA_25)).toEqual({
      inicio: { year: 2026, month: 8, day: 26 },
      fim: { year: 2026, month: 9, day: 25 },
    });
  });
});
