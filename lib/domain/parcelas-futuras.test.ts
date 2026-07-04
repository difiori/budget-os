import { describe, expect, it } from "vitest";
import { agruparParcelas, parcelasFuturas } from "./parcelas-futuras";
import type { Saida } from "./types";

const mesReferencia = { year: 2026, month: 7, day: 1 };

function parcela(overrides: Partial<Saida>): Saida {
  return {
    id: "1",
    nome: "Passagens 01/03",
    total_cents: 1000,
    data: "2026-06-01",
    vencimento: "2026-07-10",
    pessoa: "Diego",
    metodo: "Crédito",
    status: "A pagar",
    origem: "Parcelamento",
    categoria_id: "cat-1",
    conta_id: null,
    cartao_id: "cartao-1",
    parcela: "01/03",
    created_at: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("agruparParcelas", () => {
  it("agrupa pelo mesmo cartão + nome sem o sufixo NN/NN", () => {
    const saidas = [
      parcela({ id: "1", nome: "Passagens 01/03", vencimento: "2026-07-10" }),
      parcela({ id: "2", nome: "Passagens 02/03", vencimento: "2026-08-10" }),
      parcela({ id: "3", nome: "Passagens 03/03", vencimento: "2026-09-10" }),
    ];
    const grupos = agruparParcelas(saidas);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].nomeBase).toBe("Passagens");
    expect(grupos[0].parcelas).toHaveLength(3);
  });

  it("separa grupos de cartões diferentes mesmo com nome igual", () => {
    const saidas = [
      parcela({ id: "1", nome: "Compra 01/02", cartao_id: "cartao-1" }),
      parcela({ id: "2", nome: "Compra 01/02", cartao_id: "cartao-2" }),
    ];
    expect(agruparParcelas(saidas)).toHaveLength(2);
  });

  it("ignora saídas que não são de parcelamento ou sem cartão", () => {
    const saidas = [
      parcela({ origem: "Manual" }),
      parcela({ origem: "Parcelamento", cartao_id: null, conta_id: "conta-1" }),
    ];
    expect(agruparParcelas(saidas)).toHaveLength(0);
  });
});

describe("parcelasFuturas", () => {
  it("retorna só parcelas com vencimento depois do mês de referência, em ordem", () => {
    const grupo = {
      nomeBase: "Passagens",
      cartaoId: "cartao-1",
      parcelas: [
        parcela({ id: "3", nome: "Passagens 03/03", vencimento: "2026-09-10" }),
        parcela({ id: "1", nome: "Passagens 01/03", vencimento: "2026-07-10" }),
        parcela({ id: "2", nome: "Passagens 02/03", vencimento: "2026-08-10" }),
      ],
    };
    const futuras = parcelasFuturas(grupo, mesReferencia);
    expect(futuras.map((p) => p.id)).toEqual(["2", "3"]);
  });
});
