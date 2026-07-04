import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { ConfigTabs } from "./config-tabs";
import type { Cartao, Categoria, Conta } from "@/lib/domain/types";

export default async function ConfigPage() {
  const supabase = await createClient();

  const [{ data: contas }, { data: cartoes }, { data: categorias }] = await Promise.all([
    supabase.from("conta").select("id, nome, dono, saldo_atual_cents").order("nome"),
    supabase
      .from("cartao")
      .select("id, nome, dono, tipo, limite_cents, dia_fechamento, dia_vencimento, conta_vinculada_id")
      .order("nome"),
    supabase.from("categoria").select("id, nome, dono, meta_mensal_cents").order("nome"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <PageHeader title="Configurações" subtitle="Contas, cartões e categorias" />
      <ConfigTabs
        contas={(contas ?? []) as Conta[]}
        cartoes={(cartoes ?? []) as Cartao[]}
        categorias={(categorias ?? []) as Categoria[]}
      />
    </main>
  );
}
