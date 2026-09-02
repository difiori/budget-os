import type { Pessoa } from "./types";

/** Recorte de pessoa das telas: uma das duas pessoas ou o casal inteiro. */
export type Escopo = Pessoa | "Casal";

/** Lê o `?pessoa=` da URL; sem valor válido, cai na pessoa ativa do menu. */
export function resolverEscopo(param: string | undefined, ativa: Pessoa): Escopo {
  if (param === "Casal") return "Casal";
  if (param === "Diego" || param === "Vitor") return param;
  return ativa;
}

/** Ordem padrão dos chips em toda tela: pessoa ativa, a outra, Casal. */
export function ordemEscopos(ativa: Pessoa): Escopo[] {
  return [ativa, ativa === "Diego" ? "Vitor" : "Diego", "Casal"];
}
