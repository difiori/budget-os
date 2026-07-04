import { createClient } from "@/lib/supabase/server";
import type { Cartao, Categoria, Conta } from "@/lib/domain/types";
import { PageHeader } from "@/components/ui/page-header";
import { pessoaAtiva } from "@/lib/auth/pessoa-ativa";
import { LancarForm } from "./lancar-form";

export default async function LancarPage() {
  const supabase = await createClient();
  const ativa = await pessoaAtiva();

  const [{ data: contas }, { data: cartoes }, { data: categorias }] = await Promise.all([
    supabase.from("conta").select("id, nome, dono, saldo_atual_cents").order("nome"),
    supabase
      .from("cartao")
      .select("id, nome, dono, tipo, limite_cents, dia_fechamento, dia_vencimento, conta_vinculada_id")
      .order("nome"),
    supabase.from("categoria").select("id, nome, dono").order("nome"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Lançar" subtitle="Registre uma saída ou entrada" />
      <LancarForm
        contas={(contas ?? []) as Conta[]}
        cartoes={(cartoes ?? []) as Cartao[]}
        categorias={(categorias ?? []) as Categoria[]}
        pessoaAtiva={ativa}
      />
    </main>
  );
}
