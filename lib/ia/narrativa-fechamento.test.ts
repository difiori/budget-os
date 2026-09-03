import { describe, expect, it } from "vitest";
import { hashDados, mensagemNarrativa, type DadosFechamento } from "./narrativa-fechamento";

const dados: DadosFechamento = {
  mesLabel: "Setembro de 2026",
  mesAnteriorLabel: "ago",
  escopo: "Diego",
  entradas: 1354000,
  saidas: 1391009,
  resultado: -37009,
  entradasAnterior: 1200000,
  saidasAnterior: 1100000,
  resultadoAnterior: 100000,
  taxaPoupancaPct: -2.7,
  taxaPoupancaAnteriorPct: 8.3,
  fixas: { total: 800000, quantidade: 18, pctDasSaidas: 57.5, pctDasEntradas: 59 },
  variaveis: { total: 591009, quantidade: 43 },
  categorias: [{ nome: "Contas mãe", atual: 571008, anterior: 560000 }],
  maioresSaidas: [{ nome: "Cartão Daycoval", valor: 252285, categoria: "Contas mãe", dia: "06/09" }],
  fixasDivergentes: [{ nome: "Enel mãe", previsto: 13836, real: 13970 }],
};

describe("hashDados", () => {
  it("é estável para os mesmos dados e muda quando um número muda", () => {
    expect(hashDados(dados)).toBe(hashDados({ ...dados }));
    expect(hashDados(dados)).not.toBe(hashDados({ ...dados, saidas: dados.saidas + 1 }));
    expect(hashDados(dados)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("mensagemNarrativa", () => {
  it("entrega o JSON dos dados para o modelo", () => {
    expect(mensagemNarrativa(dados)).toContain('"escopo": "Diego"');
  });
});
