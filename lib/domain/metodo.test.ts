import { describe, expect, it } from "vitest";
import { destinoParaMetodo } from "./metodo";

describe("destinoParaMetodo", () => {
  it("crédito lança em cartão", () => {
    expect(destinoParaMetodo("Crédito")).toBe("cartao");
  });

  it("débito lança em conta", () => {
    expect(destinoParaMetodo("Débito")).toBe("conta");
  });
});
