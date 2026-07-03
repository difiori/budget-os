"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, CreditCard, LayoutDashboard, PlusCircle, Receipt, Settings } from "lucide-react";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/lancar", label: "Lançar", icon: PlusCircle },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/mes", label: "Mês", icon: CalendarRange },
  { href: "/lancamentos", label: "Extrato", icon: Receipt },
  { href: "/config", label: "Config", icon: Settings },
];

/** Barra fixa inferior (só mobile). O conteúdo compensa a altura com
 * padding-bottom no layout do app. */
export function NavigationBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-6">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 pb-2 pt-2.5 transition-colors ${
                active ? "text-ink" : "text-ink-3"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
              <span className="text-[0.625rem] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
