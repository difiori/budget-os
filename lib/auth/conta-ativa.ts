import { cookies } from "next/headers";
import type { Pessoa } from "@/lib/domain/types";

const COOKIE_NAME = "conta_ativa";

/** "Conta ativa": qual pessoa está sendo visualizada/editada por padrão nas
 * telas — independente de quem está autenticado (o casal edita tudo). */
export async function getContaAtiva(): Promise<Pessoa | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return value === "Diego" || value === "Vitor" ? value : null;
}

export { COOKIE_NAME as CONTA_ATIVA_COOKIE };
