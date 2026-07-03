import { describe, expect, it } from "vitest";
import {
  addMonths,
  compareCalendarDates,
  daysInMonth,
  formatCalendarDateISO,
  instantToCalendarDate,
  isSameMonth,
  parseCalendarDate,
} from "./calendar-date";

describe("parseCalendarDate / formatCalendarDateISO", () => {
  it("faz o round-trip de uma data ISO", () => {
    const date = parseCalendarDate("2026-07-02");
    expect(date).toEqual({ year: 2026, month: 7, day: 2 });
    expect(formatCalendarDateISO(date)).toBe("2026-07-02");
  });

  it("aceita timestamps completos, usando só a parte da data", () => {
    expect(parseCalendarDate("2026-07-02T10:00:00.000Z")).toEqual({
      year: 2026,
      month: 7,
      day: 2,
    });
  });
});

describe("addMonths", () => {
  it("soma meses simples", () => {
    expect(addMonths({ year: 2026, month: 7, day: 15 }, 1)).toEqual({
      year: 2026,
      month: 8,
      day: 15,
    });
  });

  it("vira o ano", () => {
    expect(addMonths({ year: 2026, month: 12, day: 5 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 5,
    });
  });

  it("ajusta o dia quando o mês de destino é mais curto (31 jan + 1 mês)", () => {
    expect(addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it("respeita ano bissexto em fevereiro", () => {
    expect(addMonths({ year: 2024, month: 1, day: 31 }, 1)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });
});

describe("daysInMonth", () => {
  it("retorna 28 para fevereiro não-bissexto e 29 para bissexto", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
  });
});

describe("isSameMonth / compareCalendarDates", () => {
  it("compara mês e ano, ignorando o dia", () => {
    expect(isSameMonth({ year: 2026, month: 7, day: 1 }, { year: 2026, month: 7, day: 31 })).toBe(
      true
    );
    expect(isSameMonth({ year: 2026, month: 7, day: 31 }, { year: 2026, month: 8, day: 1 })).toBe(
      false
    );
  });

  it("ordena cronologicamente", () => {
    expect(
      compareCalendarDates({ year: 2026, month: 7, day: 1 }, { year: 2026, month: 8, day: 1 })
    ).toBeLessThan(0);
  });
});

describe("instantToCalendarDate — fuso America/Sao_Paulo explícito", () => {
  it("mantém o mesmo dia civil quando ainda é o mesmo dia em SP", () => {
    // 2026-07-02 15:00:00 UTC = 12:00 em São Paulo (UTC-3)
    expect(instantToCalendarDate("2026-07-02T15:00:00.000Z")).toEqual({
      year: 2026,
      month: 7,
      day: 2,
    });
  });

  it("volta um dia civil perto da meia-noite UTC (ainda é o dia anterior em SP)", () => {
    // 2026-07-03 02:00:00 UTC = 23:00 de 02/07 em São Paulo (UTC-3)
    expect(instantToCalendarDate("2026-07-03T02:00:00.000Z")).toEqual({
      year: 2026,
      month: 7,
      day: 2,
    });
  });
});
