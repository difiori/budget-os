import { describe, expect, it } from "vitest";
import { formatCentsToBRL, parseCentsFromBRL } from "./money";

describe("parseCentsFromBRL", () => {
  it("converte o caso de aceite da F1: R$ 1.234,56", () => {
    expect(parseCentsFromBRL("1.234,56")).toBe(123456);
  });

  it("converte valores sem separador de milhar", () => {
    expect(parseCentsFromBRL("50,00")).toBe(5000);
    expect(parseCentsFromBRL("50,5")).toBe(5050);
  });

  it("converte valores inteiros sem centavos", () => {
    expect(parseCentsFromBRL("100")).toBe(10000);
  });

  it("rejeita entrada inválida", () => {
    expect(() => parseCentsFromBRL("abc")).toThrow();
    expect(() => parseCentsFromBRL("")).toThrow();
  });
});

describe("formatCentsToBRL", () => {
  it("formata centavos como moeda BR", () => {
    // toLocaleString usa espaço não separável ( ) entre "R$" e o valor
    expect(formatCentsToBRL(123456)).toBe("R$ 1.234,56");
  });
});
