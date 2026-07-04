import Link from "next/link";
import { chipClasses } from "./chip-styles";

/** Filtro navegável (mesmo visual do Chip, mas é um link — server-safe).
 * Usa next/link pra trocar de filtro/mês sem recarregar a página inteira. */
export function ChipLink({ label, selected, href }: { label: string; selected: boolean; href: string }) {
  return (
    <Link href={href} aria-current={selected ? "true" : undefined} className={chipClasses(selected)}>
      {label}
    </Link>
  );
}
