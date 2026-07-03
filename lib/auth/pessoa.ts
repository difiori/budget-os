import type { Pessoa } from "@/lib/domain/types";

// App de 2 usuários fixos — mapeamento simples, sem tabela dedicada.
const EMAIL_PARA_PESSOA: Record<string, Pessoa> = {
  "diego.fiori@icloud.com": "Diego",
  "vitor.estigarribia@icloud.com": "Vitor",
};

export function pessoaPorEmail(email: string | null | undefined): Pessoa | null {
  if (!email) return null;
  return EMAIL_PARA_PESSOA[email.toLowerCase()] ?? null;
}
