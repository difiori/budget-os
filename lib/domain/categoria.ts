import type { Categoria, Pessoa } from "./types";

/** Menus de categoria filtram por dono: mostra as da própria pessoa + as de "Ambos". */
export function categoriasParaPessoa(categorias: Categoria[], pessoa: Pessoa): Categoria[] {
  return categorias.filter((c) => c.dono === pessoa || c.dono === "Ambos");
}
