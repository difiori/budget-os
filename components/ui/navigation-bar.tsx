"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ComponentType } from "react";
import {
  CalendarRange,
  CreditCard,
  Landmark,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Receipt,
  Settings,
  Tags,
  X,
} from "lucide-react";
import { useLancar } from "@/components/lancar/lancar-provider";
import { AccountSwitcher } from "@/components/account-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import type { Pessoa } from "@/lib/domain/types";

interface Item {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

// Abas do dia a dia; Lançar é o ＋ central; o resto mora em "Mais".
const ESQUERDA: Item[] = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Extrato", icon: Receipt },
];
const DIREITA: Item[] = [{ href: "/cartoes", label: "Cartões", icon: CreditCard }];
const MAIS: Item[] = [
  { href: "/mes", label: "Mês", icon: CalendarRange },
  { href: "/categorias", label: "Categorias", icon: Tags },
  { href: "/contas", label: "Contas", icon: Landmark },
  { href: "/config", label: "Configurações", icon: Settings },
];

function TabLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-1 pb-2 pt-2.5 transition-colors ${active ? "text-ink" : "text-ink-3"}`}
    >
      <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
      <span className="text-[0.625rem] font-medium leading-none">{item.label}</span>
    </Link>
  );
}

/** Barra fixa inferior (só mobile): 4 abas + ＋ central (Lançar) + "Mais". */
export function NavigationBar({ contaAtiva }: { contaAtiva: Pessoa }) {
  const pathname = usePathname();
  const { abrir } = useLancar();
  const [maisAberto, setMaisAberto] = useState(false);
  const maisAtivo = MAIS.some((m) => m.href === pathname);

  return (
    <>
      {maisAberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-scrim" onClick={() => setMaisAberto(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais"
            className="glass absolute inset-x-0 bottom-0 flex flex-col gap-1 rounded-t-lg p-3"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mb-1 flex items-center justify-between px-2">
              <p className="type-title text-ink">Mais</p>
              <button
                type="button"
                onClick={() => setMaisAberto(false)}
                aria-label="Fechar"
                className="rounded-sm p-1.5 text-ink-2 hover:bg-bg hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            {MAIS.map((m) => {
              const Icon = m.icon;
              const active = pathname === m.href;
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  onClick={() => setMaisAberto(false)}
                  className={`flex items-center gap-3 rounded-sm px-3 py-2.5 transition-colors ${
                    active ? "bg-brand-tint font-semibold text-on-brand-tint" : "text-ink-2 hover:bg-bg hover:text-ink"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span className="type-label">{m.label}</span>
                </Link>
              );
            })}
            <div className="mt-2 flex flex-col gap-3 border-t border-hairline px-1 pt-3">
              <div>
                <p className="type-eyebrow mb-2 text-ink-3">Vendo como</p>
                <AccountSwitcher contaAtiva={contaAtiva} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="type-caption text-ink-2">Tema escuro</span>
                  <ThemeToggle />
                </div>
                <SignOutButton />
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        className="glass fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 items-center md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {ESQUERDA.map((item) => (
          <TabLink key={item.href} item={item} active={pathname === item.href} />
        ))}

        {/* ＋ Lançar — ação central, em destaque */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={abrir}
            aria-label="Novo lançamento"
            className="glow-brand -mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand transition-transform active:scale-95"
          >
            <Plus size={24} strokeWidth={2.4} />
          </button>
        </div>

        {DIREITA.map((item) => (
          <TabLink key={item.href} item={item} active={pathname === item.href} />
        ))}

        <button
          type="button"
          onClick={() => setMaisAberto(true)}
          aria-label="Mais"
          className={`flex flex-col items-center gap-1 pb-2 pt-2.5 transition-colors ${
            maisAtivo ? "text-ink" : "text-ink-3"
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={maisAtivo ? 2.2 : 1.7} />
          <span className="text-[0.625rem] font-medium leading-none">Mais</span>
        </button>
      </nav>
    </>
  );
}
