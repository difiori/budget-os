import { describe, expect, it } from "vitest";
import { categoriasParaPessoa } from "./categoria";
import type { Categoria } from "./types";

const categorias: Categoria[] = [
  { id: "1", nome: "Alimentação", dono: "Ambos" },
  { id: "2", nome: "Contas Jurídicas", dono: "Diego" },
  { id: "3", nome: "Shopping", dono: "Diego" },
];

describe("categoriasParaPessoa", () => {
  it("inclui categorias da própria pessoa e as de 'Ambos'", () => {
    const resultado = categoriasParaPessoa(categorias, "Diego");
    expect(resultado.map((c) => c.nome)).toEqual(["Alimentação", "Contas Jurídicas", "Shopping"]);
  });

  it("exclui categorias de outra pessoa", () => {
    const resultado = categoriasParaPessoa(categorias, "Vitor");
    expect(resultado.map((c) => c.nome)).toEqual(["Alimentação"]);
  });
});
