import { describe, expect, it } from "vitest";
import {
  diasAte,
  mesISO,
  ocorrenciaDoMes,
  ocorrenciaPrevista,
  ocorrenciasVirtuais,
  totalPrevistoMes,
  vigenteNoMes,
} from "./conta-fixa";
import type { ContaFixa } from "./types";

function contrato(p: Partial<ContaFixa> & Pick<ContaFixa, "id">): ContaFixa {
  return {
    nome: "Condomínio",
    total_cents: 50000,
    pessoa: "Diego",
    metodo: "Débito",
    categoria_id: "cat",
    conta_id: "conta-1",
    cartao_id: null,
    dia_vencimento: 6,
    ativo: true,
    inicio: "2026-07-01",
    fim: null,
    created_at: "2026-07-01T00:00:00Z",
    ...p,
  };
}

const set = { year: 2026, month: 9, day: 1 };
const out = { year: 2026, month: 10, day: 1 };

describe("vigenteNoMes", () => {
  it("vale entre início e fim, inclusive", () => {
    const cf = contrato({ id: "a", inicio: "2026-07-01", fim: "2026-10-01" });
    expect(vigenteNoMes(cf, { year: 2026, month: 6, day: 1 })).toBe(false);
    expect(vigenteNoMes(cf, set)).toBe(true);
    expect(vigenteNoMes(cf, out)).toBe(true);
    expect(vigenteNoMes(cf, { year: 2026, month: 11, day: 1 })).toBe(false);
  });
  it("inativo nunca vale", () => {
    expect(vigenteNoMes(contrato({ id: "a", ativo: false }), set)).toBe(false);
  });
});

describe("ocorrenciaPrevista", () => {
  it("débito: data = dia do contrato, vencimento = data", () => {
    expect(ocorrenciaPrevista(contrato({ id: "a" }), set)).toEqual({
      data: "2026-09-06",
      vencimento: "2026-09-06",
      total_cents: 50000,
    });
  });
  it("crédito: vencimento dia 10 do mês seguinte (regra 7)", () => {
    const cf = contrato({ id: "a", metodo: "Crédito", conta_id: null, cartao_id: "c1", dia_vencimento: 15 });
    expect(ocorrenciaPrevista(cf, set)).toEqual({ data: "2026-09-15", vencimento: "2026-10-10", total_cents: 50000 });
  });
  it("dia 31 cai no último dia de meses curtos", () => {
    const cf = contrato({ id: "a", dia_vencimento: 31 });
    expect(ocorrenciaPrevista(cf, set).data).toBe("2026-09-30");
    expect(ocorrenciaPrevista(cf, { year: 2027, month: 2, day: 1 }).data).toBe("2027-02-28");
  });
});

describe("ocorrenciasVirtuais", () => {
  const a = contrato({ id: "a" });
  const b = contrato({ id: "b", nome: "Luz", total_cents: 20000, dia_vencimento: 10 });

  it("gera virtual só para mês sem ocorrência materializada", () => {
    const saidas = [{ recorrente_id: "a", data: "2026-09-06", created_at: "" }];
    const v = ocorrenciasVirtuais([a, b], saidas, [set, out]);
    expect(v.map((x) => `${x.recorrente_id}:${x.data}`)).toEqual(["b:2026-09-10", "a:2026-10-06", "b:2026-10-10"]);
    expect(v.every((x) => x.status === "A pagar" && x.virtual)).toBe(true);
  });

  it("respeita vigência e ignora inativos", () => {
    const c = contrato({ id: "c", inicio: "2026-10-01" });
    const d = contrato({ id: "d", ativo: false });
    const v = ocorrenciasVirtuais([c, d], [], [set, out]);
    expect(v.map((x) => x.recorrente_id)).toEqual(["c"]);
  });
});

describe("totalPrevistoMes / ocorrenciaDoMes / diasAte", () => {
  it("soma só vigentes", () => {
    const cfs = [contrato({ id: "a" }), contrato({ id: "b", total_cents: 100, ativo: false })];
    expect(totalPrevistoMes(cfs, set)).toBe(50000);
  });
  it("acha a ocorrência do contrato no mês", () => {
    const saidas = [
      { id: "1", recorrente_id: "a", data: "2026-08-06", created_at: "" },
      { id: "2", recorrente_id: "a", data: "2026-09-06", created_at: "" },
    ];
    expect(ocorrenciaDoMes(saidas, "a", set)?.id).toBe("2");
    expect(ocorrenciaDoMes(saidas, "a", out)).toBeNull();
  });
  it("conta dias até a cobrança", () => {
    const hoje = { year: 2026, month: 9, day: 2 };
    expect(diasAte("2026-09-06", hoje)).toBe(4);
    expect(diasAte("2026-09-01", hoje)).toBe(-1);
  });
  it("mesISO é o 1º do mês", () => {
    expect(mesISO(set)).toBe("2026-09-01");
  });
});
