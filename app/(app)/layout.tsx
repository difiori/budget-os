import { createClient } from "@/lib/supabase/server";
import { getContaAtiva } from "@/lib/auth/conta-ativa";
import { pessoaPorEmail } from "@/lib/auth/pessoa";
import { Sidebar } from "@/components/ui/sidebar";
import { NavigationBar } from "@/components/ui/navigation-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const contaAtiva = (await getContaAtiva()) ?? pessoaPorEmail(user?.email) ?? "Diego";

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar contaAtiva={contaAtiva} />
      {/* pb-20 compensa a barra de navegação fixa do mobile; min-w-0 impede
          que textos com truncate alarguem a página além do viewport */}
      <div className="flex min-h-full min-w-0 flex-1 flex-col pb-20 md:pb-0">
        {children}
        <NavigationBar />
      </div>
    </div>
  );
}
