"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CONTA_ATIVA_COOKIE } from "@/lib/auth/conta-ativa";
import type { Pessoa } from "@/lib/domain/types";

export async function definirContaAtiva(pessoa: Pessoa): Promise<void> {
  const store = await cookies();
  store.set(CONTA_ATIVA_COOKIE, pessoa, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
