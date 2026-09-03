import { describe, expect, it } from "vitest";
import { custoMicroUsd } from "./cliente";

describe("custoMicroUsd", () => {
  it("cobra input, output e cache pelos preços de lista", () => {
    // 1000 input (sem cache) = $0.005; 100 output = $0.0025 → $0.0075 = 7500 µUSD
    expect(custoMicroUsd({ input_tokens: 1000, output_tokens: 100 })).toBe(7500);
  });
  it("tokens lidos do cache custam 10% do input", () => {
    // 1000 input, 800 do cache: 200*5 + 800*0.5 = 1000+400 = $0.0014 → 1400 µUSD
    expect(custoMicroUsd({ input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 800 })).toBe(1400);
  });
});
