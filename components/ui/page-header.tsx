import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Cabeçalho padrão de página: título em serif, subtítulo opcional e um slot
 * à direita (seletor de mês, filtros). No mobile — onde a sidebar não existe —
 * também expõe tema e sair.
 */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-6 pt-6 lg:pt-10">
      <div className="min-w-0">
        <h1 className="type-display text-ink">{title}</h1>
        {subtitle && <p className="type-label mt-1.5 text-ink-2">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {children}
        <div className="flex items-center gap-0.5 md:hidden">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
