import { describe, expect, it } from "vitest";
import { gerarEntradasRecorrentes, gerarSaidasRecorrentes } from "./recorrencia";

describe("gerarSaidasRecorrentes", () => {
  const base = {
    nome: "Aluguel",
    totalCents: 150000,
    data: { year: 2026, month: 7, day: 5 },
    pessoa: "Diego" as const,
    metodo: "Débito" as const,
    status: "Pago" as const,
    categoriaId: "categoria-apartamento",
    contaId: "conta-c6",
    cartaoId: null,
  };

  it("gera N ocorrências com o mesmo valor integral, uma por mês", () => {
    const ocorrencias = gerarSaidasRecorrentes(base, 4);
    expect(ocorrencias).toHaveLength(4);
    expect(ocorrencias.every((o) => o.total_cents === 150000)).toBe(true);
    expect(ocorrencias.map((o) => o.data)).toEqual([
      "2026-07-05",
      "2026-08-05",
      "2026-09-05",
      "2026-10-05",
    ]);
  });

  it("só a primeira ocorrência nasce com o status escolhido — futuras nascem 'A pagar'", () => {
    const ocorrencias = gerarSaidasRecorrentes(base, 3);
    expect(ocorrencias.map((o) => o.status)).toEqual(["Pago", "A pagar", "A pagar"]);
  });

  it("respeita a regra de vencimento por método (crédito = dia 10 do mês seguinte)", () => {
    const ocorrencias = gerarSaidasRecorrentes({ ...base, metodo: "Crédito", cartaoId: "cartao-x", contaId: null }, 2);
    expect(ocorrencias.map((o) => o.vencimento)).toEqual(["2026-08-10", "2026-09-10"]);
  });

  it("marca origem 'Recorrente' e parcela nula", () => {
    const [ocorrencia] = gerarSaidasRecorrentes(base, 1);
    expect(ocorrencia.origem).toBe("Recorrente");
    expect(ocorrencia.parcela).toBeNull();
  });

  it("rejeita menos de 1 mês", () => {
    expect(() => gerarSaidasRecorrentes(base, 0)).toThrow();
  });
});

describe("gerarEntradasRecorrentes", () => {
  const base = {
    nome: "Salário",
    quantiaCents: 500000,
    data: { year: 2026, month: 7, day: 1 },
    pessoa: "Vitor" as const,
    status: "Recebido" as const,
    contaDestinoId: "conta-vitor",
  };

  it("gera N ocorrências com o mesmo valor integral, uma por mês", () => {
    const ocorrencias = gerarEntradasRecorrentes(base, 3);
    expect(ocorrencias).toHaveLength(3);
    expect(ocorrencias.every((o) => o.quantia_cents === 500000)).toBe(true);
    expect(ocorrencias.map((o) => o.data)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
  });

  it("só a primeira ocorrência nasce com o status escolhido — futuras nascem 'Não recebido'", () => {
    const ocorrencias = gerarEntradasRecorrentes(base, 3);
    expect(ocorrencias.map((o) => o.status)).toEqual(["Recebido", "Não recebido", "Não recebido"]);
  });

  it("rejeita menos de 1 mês", () => {
    expect(() => gerarEntradasRecorrentes(base, 0)).toThrow();
  });
});
