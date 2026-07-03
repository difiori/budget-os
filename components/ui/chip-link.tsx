import { chipClasses } from "./chip-styles";

/** Filtro navegável (mesmo visual do Chip, mas é um link — server-safe). */
export function ChipLink({ label, selected, href }: { label: string; selected: boolean; href: string }) {
  return (
    <a href={href} aria-current={selected ? "true" : undefined} className={chipClasses(selected)}>
      {label}
    </a>
  );
}
