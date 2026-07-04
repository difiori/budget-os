import type { Pessoa } from "@/lib/domain/types";

const TAG: Record<Pessoa, string> = {
  Diego: "bg-diego-tint text-diego",
  Vitor: "bg-vitor-tint text-vitor",
};

const DOT: Record<Pessoa, string> = {
  Diego: "bg-diego",
  Vitor: "bg-vitor",
};

export function PersonTag({ pessoa }: { pessoa: Pessoa }) {
  return (
    <span className={`type-caption inline-flex items-center rounded-xs px-1.5 py-0.5 font-medium ${TAG[pessoa]}`}>
      {pessoa}
    </span>
  );
}

/** Marcador mínimo para linhas de lista — identifica a pessoa sem tomar espaço. */
export function PersonDot({ pessoa, className = "" }: { pessoa: Pessoa; className?: string }) {
  return (
    <span
      title={pessoa}
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[pessoa]} ${className}`.trim()}
      aria-label={pessoa}
    />
  );
}
