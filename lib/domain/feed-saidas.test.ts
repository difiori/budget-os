import { describe, expect, it } from "vitest";
import {
  isSaidaFutura,
  ordenarFeed,
  resumirLancamentos,
  saidasDoMesPorData,
  totalCentsDoFeed,
} from "./feed-saidas";
import { gerarParcelas } from "./parcelamento";
import { gerarSaidasRecorrentes } from "./recorrencia";
import type { Saida } from "./types";

function saida(parcial: Partial<Saida> & Pick<Saida, "id">): Saida {
  return {
    nome: "Saída",
    total_cents: 1000,
    data: "2026-09-02",
    vencimento: "2026-09-02",
    pessoa: "Diego",
    metodo: "Débito",
    status: "A pagar",
    origem: "Manual",
    categoria_id: null,
    conta_id: "conta-1",
    cartao_id: null,
    parcela: null,
    created_at: "2026-09-02T12:00:00Z",
    ...parcial,
  };
}

const setembro = { year: 2026, month: 9, day: 1 };

describe("saidasDoMesPorData", () => {
  it("mantém só as saídas com data da compra no mês", () => {
    const lista = [
      saida({ id: "ago", data: "2026-08-31" }),
      saida({ id: "set", data: "2026-09-15" }),
      saida({ id: "out", data: "2026-10-01" }),
    ];
    expect(saidasDoMesPorData(lista, setembro).map((s) => s.id)).toEqual(["set"]);
  });

  it("um parcelamento em 12x lançado em setembro deixa só a 1ª parcela em setembro", () => {
    const parcelas = gerarParcelas({
      nome: "Passagens",
      totalCents: 120000,
      numeroParcelas: 12,
      data: { year: 2026, month: 9, day: 2 },
      pessoa: "Diego",
      metodo: "Crédito",
      status: "A pagar",
      cartaoId: "cartao-1",
      categoriaId: null,
    }).map((p, i) => ({ ...p, id: `p${i}`, created_at: "2026-09-02T12:00:00Z" }));

    const emSetembro = saidasDoMesPorData(parcelas, setembro);
    expect(emSetembro).toHaveLength(1);
    expect(emSetembro[0].parcela).toBe("01/12");
    expect(saidasDoMesPorData(parcelas, { year: 2026, month: 10, day: 1 })[0].parcela).toBe("02/12");
  });

  it("sem data, usa o created_at em America/Sao_Paulo (regra 3)", () => {
    // 01/10 01:00 UTC ainda é 30/09 em São Paulo.
    const lista = [saida({ id: "fuso", data: null, created_at: "2026-10-01T01:00:00Z" })];
    expect(saidasDoMesPorData(lista, setembro)).toHaveLength(1);
    expect(saidasDoMesPorData(lista, { year: 2026, month: 10, day: 1 })).toHaveLength(0);
  });
});

describe("isSaidaFutura", () => {
  const hoje = { year: 2026, month: 9, day: 2 };
  it("data depois de hoje é futura; hoje e antes não", () => {
    expect(isSaidaFutura(saida({ id: "a", data: "2026-09-03" }), hoje)).toBe(true);
    expect(isSaidaFutura(saida({ id: "b", data: "2026-09-02" }), hoje)).toBe(false);
    expect(isSaidaFutura(saida({ id: "c", data: "2026-08-30" }), hoje)).toBe(false);
  });
});

describe("resumirLancamentos", () => {
  it("parcelamento: número de parcelas e total da compra", () => {
    const parcelas = gerarParcelas({
      nome: "Sofá",
      totalCents: 100001,
      numeroParcelas: 3,
      data: { year: 2026, month: 9, day: 2 },
      pessoa: "Vitor",
      metodo: "Crédito",
      status: "A pagar",
      cartaoId: "cartao-1",
      categoriaId: null,
    }).map((p, i) => ({ ...p, id: `p${i}`, created_at: "2026-09-02T12:00:00Z" }));

    const resumo = resumirLancamentos(parcelas);
    expect(resumo.get("p0")).toEqual({ tipo: "parcelado", parcelas: 3, totalCents: 100001 });
    expect(resumo.get("p2")).toEqual({ tipo: "parcelado", parcelas: 3, totalCents: 100001 });
  });

  it("recorrência: quantidade de ocorrências e a última data", () => {
    const ocorrencias = gerarSaidasRecorrentes(
      {
        nome: "Aluguel",
        totalCents: 150000,
        data: { year: 2026, month: 9, day: 5 },
        pessoa: "Diego",
        metodo: "Débito",
        status: "Pago",
        categoriaId: null,
        contaId: "conta-1",
        cartaoId: null,
      },
      12
    ).map((o, i) => ({ ...o, id: `r${i}`, created_at: "2026-09-02T12:00:00Z" }));

    const resumo = resumirLancamentos(ocorrencias);
    expect(resumo.get("r0")).toEqual({
      tipo: "recorrente",
      ocorrencias: 12,
      ultimaData: { year: 2027, month: 8, day: 5 },
    });
  });

  it("saída manual avulsa não recebe resumo", () => {
    expect(resumirLancamentos([saida({ id: "x" })]).size).toBe(0);
  });

  it("não mistura lançamentos diferentes criados no mesmo instante", () => {
    const mesmoInstante = "2026-09-02T12:00:00Z";
    const a = saida({ id: "a1", nome: "TV 01/02", parcela: "01/02", origem: "Parcelamento", total_cents: 500, cartao_id: "c1", conta_id: null, created_at: mesmoInstante });
    const a2 = saida({ id: "a2", nome: "TV 02/02", parcela: "02/02", origem: "Parcelamento", total_cents: 500, cartao_id: "c1", conta_id: null, created_at: mesmoInstante });
    const b = saida({ id: "b1", nome: "Cadeira 01/02", parcela: "01/02", origem: "Parcelamento", total_cents: 700, cartao_id: "c1", conta_id: null, created_at: mesmoInstante });
    const resumo = resumirLancamentos([a, a2, b]);
    expect(resumo.get("a1")).toEqual({ tipo: "parcelado", parcelas: 2, totalCents: 1000 });
    expect(resumo.get("b1")).toEqual({ tipo: "parcelado", parcelas: 2, totalCents: 700 });
  });
});

describe("ordenarFeed", () => {
  const nomes = new Map([["c1", "Mercado"], ["c2", "Casa"]]);
  const categoriaNome = (id: string | null) => (id && nomes.get(id)) ?? "Sem categoria";
  const lista = [
    saida({ id: "1", nome: "Zebra", total_cents: 300, data: "2026-09-10", categoria_id: "c1", created_at: "2026-09-10T10:00:00Z" }),
    saida({ id: "2", nome: "Abacate", total_cents: 100, data: "2026-09-01", categoria_id: "c2", created_at: "2026-09-12T10:00:00Z" }),
    saida({ id: "3", nome: "Manga", total_cents: 200, data: "2026-09-05", categoria_id: "c1", created_at: "2026-09-11T10:00:00Z" }),
  ];

  it("registro desc é o padrão: o registrado por último vem primeiro", () => {
    expect(ordenarFeed(lista, { campo: "registro", direcao: "desc" }, categoriaNome).map((s) => s.id)).toEqual(["2", "3", "1"]);
  });

  it("ordena por valor nas duas direções", () => {
    expect(ordenarFeed(lista, { campo: "valor", direcao: "desc" }, categoriaNome).map((s) => s.id)).toEqual(["1", "3", "2"]);
    expect(ordenarFeed(lista, { campo: "valor", direcao: "asc" }, categoriaNome).map((s) => s.id)).toEqual(["2", "3", "1"]);
  });

  it("ordena por data da compra e por nome", () => {
    expect(ordenarFeed(lista, { campo: "data", direcao: "asc" }, categoriaNome).map((s) => s.id)).toEqual(["2", "3", "1"]);
    expect(ordenarFeed(lista, { campo: "nome", direcao: "asc" }, categoriaNome).map((s) => s.id)).toEqual(["2", "3", "1"]);
  });

  it("categoria agrupa pelo nome da categoria e desempata pelo registro mais novo", () => {
    expect(ordenarFeed(lista, { campo: "categoria", direcao: "asc" }, categoriaNome).map((s) => s.id)).toEqual(["2", "3", "1"]);
  });
});

describe("totalCentsDoFeed", () => {
  it("soma os valores", () => {
    expect(totalCentsDoFeed([saida({ id: "a", total_cents: 150 }), saida({ id: "b", total_cents: 250 })])).toBe(400);
  });
});
