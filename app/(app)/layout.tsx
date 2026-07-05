import { createClient } from "@/lib/supabase/server";
import { getContaAtiva } from "@/lib/auth/conta-ativa";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import { Sidebar } from "@/components/ui/sidebar";
import { NavigationBar } from "@/components/ui/navigation-bar";
import { Calculator } from "@/components/ui/calculator";
import { LancarProvider } from "@/components/lancar/lancar-provider";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import type { Cartao, Categoria, Conta } from "@/lib/domain/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const contaAtiva = (await getContaAtiva()) ?? pessoaPorEmail(user?.email) ?? "Diego";

  // Dados do formulário de Lançar, buscados uma vez para o overlay global.
  const [{ data: contas }, { data: cartoes }, { data: categorias }] = await Promise.all([
    supabase.from("conta").select("id, nome, dono, saldo_atual_cents").order("nome"),
    supabase
      .from("cartao")
      .select("id, nome, dono, tipo, limite_cents, dia_fechamento, dia_vencimento, conta_vinculada_id")
      .order("nome"),
    supabase.from("categoria").select("id, nome, dono").order("nome"),
  ]);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <LancarProvider
          contas={(contas ?? []) as Conta[]}
          cartoes={(cartoes ?? []) as Cartao[]}
          categorias={(categorias ?? []) as Categoria[]}
          pessoaAtiva={contaAtiva}
        >
          <div className="flex min-h-full flex-1">
            <Sidebar contaAtiva={contaAtiva} />
            {/* pb-20 compensa a barra de navegação fixa do mobile; min-w-0 impede
                que textos com truncate alarguem a página além do viewport */}
            <div className="flex min-h-full min-w-0 flex-1 flex-col pb-20 md:pb-0">
              {children}
              <NavigationBar contaAtiva={contaAtiva} />
            </div>
          </div>
          <Calculator />
        </LancarProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
