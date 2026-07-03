"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, CreditCard, LayoutDashboard, PlusCircle, Receipt, Settings } from "lucide-react";
import type { ComponentType } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { AccountSwitcher } from "@/components/account-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Pessoa } from "@/lib/domain/types";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/lancar", label: "Lançar", icon: PlusCircle },
  { href: "/faturas", label: "Faturas", icon: CreditCard },
  { href: "/mes", label: "Mês", icon: CalendarRange },
  { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { href: "/config", label: "Configurações", icon: Settings },
];

export function Sidebar({ contaAtiva }: { contaAtiva: Pessoa }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline bg-surface px-4 py-7 md:flex">
      <div className="mb-9 px-3">
        <p className="text-[1.4rem] italic leading-tight text-ink" style={{ fontFamily: "var(--font-display)" }}>
          Nosso Orçamento
        </p>
        <p className="type-eyebrow mt-1 text-ink-3">Diego &amp; Vitor</p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-sm px-3 py-2.5 transition-colors ${
                active
                  ? "bg-brand-tint font-semibold text-on-brand-tint"
                  : "text-ink-2 hover:bg-bg hover:text-ink"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.1 : 1.7} />
              <span className="type-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-4 px-1">
        <div>
          <p className="type-eyebrow mb-2 text-ink-3">Vendo como</p>
          <AccountSwitcher contaAtiva={contaAtiva} />
        </div>
        <div className="flex items-center justify-between border-t border-hairline pt-3">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
