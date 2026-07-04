import { describe, expect, it } from "vitest";
import { progressoPercent } from "./orcamento";

describe("progressoPercent", () => {
  it("calcula o percentual do realizado sobre a meta", () => {
    expect(progressoPercent(5000, 10000)).toBe(50);
  });

  it("pode passar de 100 quando estoura a meta", () => {
    expect(progressoPercent(15000, 10000)).toBe(150);
  });

  it("meta zero ou negativa retorna 0 (evita divisão por zero)", () => {
    expect(progressoPercent(5000, 0)).toBe(0);
    expect(progressoPercent(5000, -100)).toBe(0);
  });
});
