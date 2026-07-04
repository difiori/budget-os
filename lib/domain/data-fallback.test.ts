import { describe, expect, it } from "vitest";
import { dataParaCalculo } from "./data-fallback";

describe("dataParaCalculo (regra 3)", () => {
  it("usa `data` quando presente", () => {
    expect(
      dataParaCalculo({ data: "2026-07-15", created_at: "2026-07-01T00:00:00.000Z" })
    ).toEqual({ year: 2026, month: 7, day: 15 });
  });

  it("cai para `created_at` (em America/Sao_Paulo) quando `data` é nula", () => {
    // captura automática sem data explícita
    expect(
      dataParaCalculo({ data: null, created_at: "2026-07-02T15:00:00.000Z" })
    ).toEqual({ year: 2026, month: 7, day: 2 });
  });
});
