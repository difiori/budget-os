import type { ReactNode } from "react";

/** Classe padrão de inputs/selects do app — borda hairline, foco em tinta. */
export const inputClasses =
  "w-full rounded-sm border border-hairline-strong bg-raised px-3.5 py-2.5 text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink-2";

/** Rótulo + controle, no padrão de formulário do app. */
export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="type-label mb-1.5 block text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="type-caption mt-1.5 text-ink-3">{hint}</p>}
    </div>
  );
}
