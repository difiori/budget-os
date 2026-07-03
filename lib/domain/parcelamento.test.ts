import { describe, expect, it } from "vitest";
import { gerarParcelas } from "./parcelamento";

const base = {
  nome: "Compra Teste",
  pessoa: "Diego" as const,
  metodo: "Crédito" as const,
  status: "A pagar" as const,
  cartaoId: "cartao-carbon-black",
  categoriaId: "categoria-shopping",
};

describe("gerarParcelas (regra 5)", () => {
  it("critério de aceite F2: parcelamento de 3x gera 3 linhas com valores e nomes corretos", () => {
    const parcelas = gerarParcelas({
      ...base,
      totalCents: 10000,
      numeroParcelas: 3,
      data: { year: 2026, month: 1, day: 31 },
    });

    expect(parcelas).toHaveLength(3);
    expect(parcelas.map((p) => p.total_cents)).toEqual([3333, 3333, 3334]);
    expect(parcelas.reduce((sum, p) => sum + p.total_cents, 0)).toBe(10000);
    expect(parcelas.map((p) => p.nome)).toEqual([
      "Compra Teste 01/03",
      "Compra Teste 02/03",
      "Compra Teste 03/03",
    ]);
    expect(parcelas.map((p) => p.parcela)).toEqual(["01/03", "02/03", "03/03"]);
  });

  it("cada parcela cai na fatura do seu próprio mês, com vencimento dia 10 do mês seguinte", () => {
    const parcelas = gerarParcelas({
      ...base,
      totalCents: 10000,
      numeroParcelas: 3,
      data: { year: 2026, month: 1, day: 31 },
    });

    expect(parcelas.map((p) => p.data)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(parcelas.map((p) => p.vencimento)).toEqual([
      "2026-02-10",
      "2026-03-10",
      "2026-04-10",
    ]);
  });

  it("marca origem 'Parcelamento' e conta_id nulo (cartão obrigatório)", () => {
    const [parcela] = gerarParcelas({
      ...base,
      totalCents: 10000,
      numeroParcelas: 2,
      data: { year: 2026, month: 7, day: 1 },
    });

    expect(parcela.origem).toBe("Parcelamento");
    expect(parcela.conta_id).toBeNull();
    expect(parcela.cartao_id).toBe("cartao-carbon-black");
  });

  it("aplica zero à esquerda com largura de 2 mesmo para poucas parcelas", () => {
    const parcelas = gerarParcelas({
      ...base,
      totalCents: 900,
      numeroParcelas: 9,
      data: { year: 2026, month: 7, day: 1 },
    });
    expect(parcelas[0].parcela).toBe("01/09");
    expect(parcelas[8].parcela).toBe("09/09");
  });

  it("rejeita menos de 1 parcela", () => {
    expect(() =>
      gerarParcelas({ ...base, totalCents: 1000, numeroParcelas: 0, data: { year: 2026, month: 7, day: 1 } })
    ).toThrow();
  });
});
