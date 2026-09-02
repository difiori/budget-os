import { ChipLink } from "./chip-link";
import { ordemEscopos, type Escopo } from "@/lib/domain/escopo";
import type { Pessoa } from "@/lib/domain/types";

/** Os três chips de recorte (ativa · outra · Casal), iguais em toda tela. */
export function EscopoChips({
  ativa,
  escopo,
  href,
}: {
  ativa: Pessoa;
  escopo: Escopo;
  href: (escopo: Escopo) => string;
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-1.5">
      {ordemEscopos(ativa).map((e) => (
        <ChipLink key={e} label={e} selected={escopo === e} href={href(e)} />
      ))}
    </div>
  );
}
